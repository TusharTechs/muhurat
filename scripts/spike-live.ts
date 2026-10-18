/**
 * Step 1 spike, live: seal a bank to real drand quicknet, publish it on Arkiv Tiramisu, read it
 * back from Arkiv, and open it once the round arrives.
 *
 *   PRIVATE_KEY=0x... npm run spike:live            # opens 90 s after sealing
 *   PRIVATE_KEY=0x... OPEN_IN_SECONDS=180 npm run spike:live
 *
 * The key must hold Tiramisu GLM from the faucet. It is read from the environment only.
 */
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { type Hex, formatEther, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { NOBODY, fetchSealedBanks, publishSealedBank } from "../src/arkiv"
import { sampleBank } from "../src/bank"
import { QUICKNET, dateForRound, offlineClient, quicknetClient, roundForDate } from "../src/drand"
import { open, seal } from "../src/seal"

const EXPLORER = "https://tiramisu.explorer.arkiv.network"
const privateKey = process.env.PRIVATE_KEY as Hex | undefined
if (!privateKey?.startsWith("0x")) {
  console.error("Set PRIVATE_KEY to a funded Tiramisu key (0x...).")
  process.exit(1)
}
const openInSeconds = Number(process.env.OPEN_IN_SECONDS ?? 90)
const exam = `spike-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`

const account = privateKeyToAccount(privateKey)
const publicClient = createPublicClient({ chain: tiramisu, transport: http() })
const walletClient = createWalletClient({ chain: tiramisu, transport: http(), account })

/** The SDK buries the reason a write failed (see arkiv/friction.md F1); walk the causes for it. */
function reasonOf(err: unknown): string {
  const lines: string[] = []
  for (let e = err as { shortMessage?: string; details?: string; message?: string; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    const line = (e.details ?? e.shortMessage ?? e.message ?? "").split("\n")[0]
    if (line && !lines.includes(line)) lines.push(line)
  }
  return lines.join("\n         <- ")
}
process.on("unhandledRejection", (err) => {
  console.error(`\nfailed   ${reasonOf(err)}`)
  process.exit(1)
})

const balance = await publicClient.getBalance({ address: account.address })
console.log(`balance  ${formatEther(balance)} GLM`)
if (balance === 0n) {
  console.error(`\n${account.address} has no Tiramisu GLM. Send it 2 GLM (or claim at https://hub.arkiv.network/faucet), then rerun.`)
  process.exit(1)
}

const round = roundForDate(new Date(Date.now() + openInSeconds * 1000))
const opensAt = dateForRound(round)
const bankBytes = new TextEncoder().encode(JSON.stringify(sampleBank(exam, "physics", 60)))

console.log(`setter   ${account.address}`)
console.log(`exam     ${exam}, opens ${opensAt.toISOString()} (quicknet round ${round})`)

const armored = await seal(bankBytes, round, offlineClient())
const { entityKey, txHash } = await publishSealedBank(publicClient, walletClient, {
  exam,
  section: "physics",
  round,
  chainHash: `0x${QUICKNET.hash}`,
  opensAt,
  armored,
})
console.log(`sealed   ${entityKey}\n         ${EXPLORER}/tx/${txHash}`)

const [bank] = await fetchSealedBanks(publicClient, exam, [account.address])
assert.ok(bank, "the sealed bank is not queryable by exam + creator")
assert.equal(bank.key, entityKey)
assert.equal(bank.creator.toLowerCase(), account.address.toLowerCase(), "$creator is the setter")
assert.equal(bank.owner.toLowerCase(), NOBODY.toLowerCase(), "custody went to 0x...dEaD")
assert.ok(bank.creationFlags.readonly && bank.creationFlags.permissionlessExtension, "flags")
console.log(`read     creator=setter, owner=0x...dEaD, readonly, expires at block ${bank.expiresAt}`)

const patch = await walletClient
  .patchEntity({ entityKey, set: { section: "chemistry" } })
  .then(() => "accepted", (err: Error) => err.message.split("\n")[0])
console.log(`patch    setter tries to edit the sealed bank -> ${patch}`)
assert.notEqual(patch, "accepted", "a sealed bank must not be editable")

const fromArkiv = new TextDecoder().decode(bank.payload)
const early = await open(fromArkiv, { round }, quicknetClient()).then(
  () => "opened",
  (err: Error) => err.message,
)
console.log(`early    ${early}`)
assert.match(early, /too early/)

const waitMs = opensAt.getTime() - Date.now() + 4000
console.log(`waiting  ${Math.ceil(waitMs / 1000)} s for the bell...`)
await new Promise((r) => setTimeout(r, waitMs))

const opened = await open(fromArkiv, { round }, quicknetClient())
assert.deepEqual(opened, bankBytes, "opened bank differs from what was sealed")
const paper = JSON.parse(new TextDecoder().decode(opened))
console.log(`opened   ${paper.questions.length} questions, first: "${paper.questions[0].text.slice(0, 60)}..."`)

const evidence = {
  spike: "step 1: seal on quicknet, publish on Tiramisu, open at the round",
  at: new Date().toISOString(),
  chainId: tiramisu.id,
  setter: account.address,
  exam,
  quicknetRound: round,
  opensAt: opensAt.toISOString(),
  entityKey,
  txHash,
  explorer: `${EXPLORER}/tx/${txHash}`,
  checks: { creatorIsSetter: true, ownerIsDead: true, readonly: true, patchRejected: patch, earlyOpen: early, openedMatches: true },
}
await mkdir("arkiv", { recursive: true })
await writeFile("arkiv/evidence-spike.json", `${JSON.stringify(evidence, null, 2)}\n`)
console.log("\nStep 1 passed live. Evidence written to arkiv/evidence-spike.json")
