/**
 * Step 1 spike, offline: proves the seal / open / publish path without network access.
 *
 * A local drand network stands in for quicknet. It runs the same scheme (BLS on G1, RFC 9380) and
 * the same tlock-js and drand-client code, but its beacons exist only once their round time has
 * passed, exactly like the real network. The Arkiv half runs the real SDK against a recording
 * provider that captures the signed transaction instead of sending it.
 */
import assert from "node:assert/strict"
import { createHash, randomBytes } from "node:crypto"
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { bls12_381 as bls } from "@noble/curves/bls12-381"
import { type ChainClient, type ChainInfo, roundAt, roundTime } from "drand-client"
import {
  type Hex,
  custom,
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  parseAbi,
  parseAbiParameters,
  parseTransaction,
} from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { NOBODY, publishSealedBank } from "../src/arkiv"
import { sampleBank } from "../src/bank"
import { QUICKNET, beaconClient, offlineClient } from "../src/drand"
import { SealRejectedError, assertSealedFor, open, readSealHeader, seal } from "../src/seal"

const RFC9380_G1_DST = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_"
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A one-node drand network with quicknet's scheme and a 3 s period. */
function localDrand(name: string) {
  const sk = BigInt(`0x${randomBytes(32).toString("hex")}`) % bls.fields.Fr.ORDER
  const info: ChainInfo = {
    public_key: Buffer.from(bls.G2.ProjectivePoint.BASE.multiply(sk).toRawBytes(true)).toString("hex"),
    period: 3,
    genesis_time: Math.floor(Date.now() / 1000) - 30,
    hash: sha256(Buffer.from(name)).toString("hex"),
    groupHash: sha256(Buffer.from(`${name}-group`)).toString("hex"),
    schemeID: "bls-unchained-g1-rfc9380",
    metadata: { beaconID: name },
  }
  const beaconFor = (round: number) => {
    const message = Buffer.alloc(8)
    message.writeBigUInt64BE(BigInt(round))
    const point = bls.G1.hashToCurve(sha256(message), { DST: RFC9380_G1_DST }) as typeof bls.G1.ProjectivePoint.BASE
    const signature = Buffer.from(point.multiply(sk).toRawBytes(true))
    return { round, signature: signature.toString("hex"), randomness: sha256(signature).toString("hex") }
  }
  const client: ChainClient = {
    options: { disableBeaconVerification: false, noCache: true },
    chain: () => ({ baseUrl: name, info: async () => info }),
    latest: async () => beaconFor(roundAt(Date.now(), info)),
    get: async (round) => {
      if (roundTime(info, round) > Date.now()) throw new Error(`round ${round} not published yet`)
      return beaconFor(round)
    },
  }
  return { info, client, beaconFor }
}

async function step(name: string, run: () => Promise<void>) {
  const started = Date.now()
  await run()
  console.log(`  ok  ${name} (${Date.now() - started} ms)`)
}

console.log("Muhurat step 1 spike (offline)\n")
const bankBytes = new TextEncoder().encode(JSON.stringify(sampleBank("demo-neet-mock-001", "physics", 60)))
const local = localDrand("local-quicknet-twin")

await step("seal to a round 2 periods ahead, read the header without decrypting", async () => {
  const round = roundAt(Date.now(), local.info) + 2
  const armored = await seal(bankBytes, round, local.client)
  assert.deepEqual(readSealHeader(armored), { round, chainHash: local.info.hash })

  await assert.rejects(open(armored, { round, chainHash: local.info.hash }, local.client), /too early/)
  await sleep(roundTime(local.info, round) - Date.now() + 250)
  const opened = await open(armored, { round, chainHash: local.info.hash }, local.client)
  assert.deepEqual(opened, bankBytes)
})

await step("reject a bank sealed to a private drand network the setter controls", async () => {
  const rogue = localDrand("setter-private-network")
  const round = roundAt(Date.now(), rogue.info) + 1000
  const armored = await seal(bankBytes, round, rogue.client)
  assert.throws(() => assertSealedFor(armored, { round, chainHash: local.info.hash }), SealRejectedError)
})

await step("reject a bank sealed to the wrong round", async () => {
  const round = roundAt(Date.now(), local.info) + 1000
  const armored = await seal(bankBytes, round, local.client)
  assert.throws(() => assertSealedFor(armored, { round: round - 1, chainHash: local.info.hash }), /round/)
})

await step("open with a 48-byte key relayed out of band, and refuse a forged one", async () => {
  const round = roundAt(Date.now(), local.info) - 1
  const armored = await seal(bankBytes, round, local.client)
  const beacon = local.beaconFor(round)
  assert.equal(Buffer.from(beacon.signature, "hex").length, 48)
  const relayed = await beaconClient(beacon, local.info)
  assert.deepEqual(await open(armored, { round, chainHash: local.info.hash }, relayed), bankBytes)

  // Another round's signature, with randomness recomputed so only the BLS check can catch it.
  const signature = local.beaconFor(round + 1).signature
  const forged = { ...beacon, signature, randomness: sha256(Buffer.from(signature, "hex")).toString("hex") }
  await assert.rejects(beaconClient(forged, local.info), /does not verify/)
})

let quicknetArmored = ""
let quicknetRound = 0
await step("seal to real drand quicknet with no network (public key only)", async () => {
  quicknetRound = roundAt(Date.now() + 10 * 60_000, QUICKNET)
  quicknetArmored = await seal(bankBytes, quicknetRound, offlineClient())
  assertSealedFor(quicknetArmored, { round: quicknetRound })
  console.log(
    `      60-question bank: ${bankBytes.length} B plaintext -> ${quicknetArmored.length} B armored (round ${quicknetRound})`,
  )
})

await step("build the Arkiv batch: readonly create + custody to 0x...dEaD, same transaction", async () => {
  const EXECUTE_ABI = parseAbi(["function execute((uint8 operation, bytes operationData)[] ops) external returns (bytes32[] keys)"])
  const CREATE = parseAbiParameters(
    "(uint128 salt, uint64 expiresAt, uint64 minLifetime, uint8 creationFlags, (bytes32 name, uint8 typeId, bytes value)[] attributes)",
  )
  const TRANSFER = parseAbiParameters("(bytes32 entityKey, address newOwner)")
  const entityNonce = 7n
  let captured: Hex | undefined
  const recorder = custom({
    async request({ method, params }) {
      switch (method) {
        case "eth_chainId":
          return `0x${tiramisu.id.toString(16)}`
        case "eth_blockNumber":
          return "0x100000"
        case "eth_call":
          return encodeAbiParameters([{ type: "uint64" }], [entityNonce])
        case "eth_getTransactionCount":
          return "0x0"
        case "eth_getBlockByNumber":
          return { number: "0x100000", hash: `0x${"11".repeat(32)}`, timestamp: "0x0", baseFeePerGas: "0x7", gasLimit: "0x1c9c380", gasUsed: "0x0", transactions: [] }
        case "eth_maxPriorityFeePerGas":
        case "eth_gasPrice":
          return "0x1"
        case "eth_estimateGas":
          return "0x2dc6c0"
        case "eth_sendRawTransaction":
          captured = (params as Hex[])[0]
          throw new Error("captured")
        default:
          throw new Error(`unexpected RPC ${method}`)
      }
    },
  })
  const account = privateKeyToAccount(generatePrivateKey())
  const publicClient = createPublicClient({ chain: tiramisu, transport: recorder })
  const walletClient = createWalletClient({ chain: tiramisu, transport: recorder, account })
  const opensAt = new Date(roundTime(QUICKNET, quicknetRound))

  // The recorder stops at eth_sendRawTransaction, so the SDK reports a failed send; what matters
  // is the transaction it signed.
  await publishSealedBank(publicClient, walletClient, {
    exam: "demo-neet-mock-001",
    section: "physics",
    round: quicknetRound,
    chainHash: `0x${QUICKNET.hash}`,
    opensAt,
    armored: quicknetArmored,
  }).catch(() => {})
  assert.ok(captured, "no transaction was signed")

  const tx = parseTransaction(captured)
  const { args } = decodeFunctionData({ abi: EXECUTE_ABI, data: tx.data! })
  const [ops] = args
  assert.deepEqual(ops.map((o) => o.operation), [1, 4], "expected [Create, TransferOwnership]")

  const [create] = decodeAbiParameters(CREATE, ops[0].operationData)
  assert.equal(create.creationFlags, 0b11, "readonly + permissionlessExtension")
  const names = create.attributes.map((a) => Buffer.from(a.name.slice(2), "hex").toString().replace(/\0+$/, ""))
  for (const n of ["app", "kind", "exam", "section", "round", "chain", "opens_at", "ct_sha256"]) {
    assert.ok(names.includes(n), `missing attribute ${n}`)
  }

  const [transfer] = decodeAbiParameters(TRANSFER, ops[1].operationData)
  assert.equal(transfer.newOwner.toLowerCase(), NOBODY.toLowerCase())
  const { key: predicted } = (await publicClient.predictEntityKeys({ owner: account.address, salts: [create.salt] }))[0]
  assert.equal(transfer.entityKey, predicted, "transfer must name the key the create will mint")

  console.log(`      signed tx: ${(captured.length - 2) / 2} B; attributes: ${names.join(", ")}`)
})

console.log("\nAll offline checks passed. Next: npm run spike:live (needs network + a funded Tiramisu key).")
