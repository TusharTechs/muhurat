/**
 * Local stand-in for Arkiv's JSON-RPC and a drand relay, for end-to-end UI tests without network
 * access. It runs its own drand-compatible network (same scheme as quicknet, its own key) and seeds
 * exams built with the app's real create functions, sealed with real tlock.
 *
 *   npx tsx scripts/mock/server.ts            # http://localhost:8787, writes scripts/mock/.env.mock
 *
 * Then: vite --mode mock (reads .env.mock). Not used by production builds.
 */
import { createHash, randomBytes } from "node:crypto"
import { writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { bls12_381 as bls } from "@noble/curves/bls12-381"
import { type ChainInfo, roundAt, roundTime } from "drand-client"
import { toHex } from "viem"
import { NOBODY, appointmentCreate, beaconCreate, examCreate, leakClaimCreate, leaseCreate, openedCreate, sealedBankCreate } from "../../src/arkiv"
import { claimFingerprints } from "../../src/claims"
import { offlineClient } from "../../src/drand"
import { assemblePaper, centreVariant, variantHash } from "../../src/paper"
import { type Section, bankFor } from "../../src/questions"
import { seal } from "../../src/seal"

const PORT = 8787
const BELL_IN = Number(process.env.BELL_IN ?? 75)
const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest()
const now = () => Date.now()

// ---------------------------------------------------------------- a local drand network

const sk = BigInt(`0x${randomBytes(32).toString("hex")}`) % bls.fields.Fr.ORDER
const info: ChainInfo = {
  public_key: Buffer.from(bls.G2.ProjectivePoint.BASE.multiply(sk).toRawBytes(true)).toString("hex"),
  period: 3,
  genesis_time: Math.floor(now() / 1000) - 3600,
  hash: sha256("muhurat-mock-drand").toString("hex"),
  groupHash: sha256("muhurat-mock-group").toString("hex"),
  schemeID: "bls-unchained-g1-rfc9380",
  metadata: { beaconID: "mock" },
}
function beacon(round: number) {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(round))
  const point = bls.G1.hashToCurve(sha256(message), { DST: "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_" }) as typeof bls.G1.ProjectivePoint.BASE
  const signature = Buffer.from(point.multiply(sk).toRawBytes(true))
  return { round, signature: signature.toString("hex"), randomness: sha256(signature).toString("hex") }
}
const roundFor = (t: number) => {
  const r = roundAt(t, info)
  return roundTime(info, r) < t ? r + 1 : r
}

// ---------------------------------------------------------------- a tiny Arkiv

const CHAIN_GENESIS = now() - 10 * 86_400_000
const blockAt = (t: number) => BigInt(Math.floor((t - CHAIN_GENESIS) / 2000))
const timeOf = (b: bigint) => CHAIN_GENESIS + Number(b) * 2000

type Stored = {
  key: string
  creator: string
  owner: string
  createdAt: bigint
  expiresAt: bigint
  flags: { readonly: boolean; permissionlessExtension: boolean }
  contentType: string
  payload: Uint8Array
  attributes: { name: string; type: string; value: unknown }[]
}
const db: Stored[] = []
const address = (label: string) => `0x${sha256(label).toString("hex").slice(0, 40)}`

type Create = { payload: Uint8Array; contentType: string; attributes?: object; flags?: { readonly?: boolean; permissionlessExtension?: boolean }; expires: unknown }
function insert(c: Create, creator: string, at: number, owner = creator) {
  const life = c.expires as unknown as { minLifetime: bigint; expiresAt: bigint | Date }
  const createdAt = blockAt(at)
  const absolute = life.expiresAt instanceof Date ? blockAt(life.expiresAt.getTime()) : life.expiresAt
  const expiresAt = absolute > createdAt + life.minLifetime ? absolute : createdAt + life.minLifetime
  const attributes = Object.entries(c.attributes ?? {}).map(([name, v]) => {
    const { type, value } = v as { type: string; value: unknown }
    return { name, type, value: typeof value === "bigint" ? toHex(value) : value }
  })
  const entity: Stored = {
    key: `0x${sha256(`${creator}/${db.length}/${at}`).toString("hex")}`,
    creator,
    owner,
    createdAt,
    expiresAt,
    flags: { readonly: !!c.flags?.readonly, permissionlessExtension: !!c.flags?.permissionlessExtension },
    contentType: c.contentType,
    payload: c.payload,
    attributes,
  }
  db.push(entity)
  return entity
}

// ---------------------------------------------------------------- seed

const board = address("board")
const SECTIONS: Section[] = ["biology", "chemistry", "physics"]
const setters = Object.fromEntries(SECTIONS.map((s) => [s, address(`setter/${s}`)])) as Record<Section, string>
const CENTRES = [
  { centre: "MUM-01", state: "Maharashtra" },
  { centre: "PAT-01", state: "Bihar" },
  { centre: "HZB-01", state: "Jharkhand" },
]
const centreAddr = (c: string) => address(`centre/${c}`)
const intruder = address("intruder")

async function seedExam(exam: string, bellAt: number, mode: "past" | "soon" | "future") {
  const round = roundFor(bellAt)
  const opensAt = new Date(roundTime(info, round))
  const chainHash = `0x${info.hash}` as const
  const publishedAt = mode === "future" ? now() - 120_000 : opensAt.getTime() - 30 * 60_000
  insert(examCreate({ exam, title: "Demo NEET-style mock (synthetic questions)", round, chainHash, opensAt, sections: SECTIONS, perSection: 5 }), board, publishedAt)
  for (const s of SECTIONS) insert(appointmentCreate(exam, opensAt, { role: "setter", member: setters[s] as `0x${string}`, section: s }), board, publishedAt)
  for (const c of CENTRES) insert(appointmentCreate(exam, opensAt, { role: "centre", member: centreAddr(c.centre) as `0x${string}`, ...c }), board, publishedAt)

  const banks = SECTIONS.map((s) => bankFor(exam, s))
  for (const bank of banks) {
    const armored = await seal(new TextEncoder().encode(JSON.stringify(bank)), round, offlineClient(info))
    insert(sealedBankCreate({ exam, section: bank.section, round, chainHash, opensAt, armored }, 0n), setters[bank.section as Section], publishedAt + 60_000, NOBODY)
  }
  if (mode === "future") return

  // An unappointed wallet tries to slip in a bank of its own: the app must ignore it.
  const forged = await seal(new TextEncoder().encode(JSON.stringify(bankFor(exam, "physics"))), round, offlineClient(info))
  insert(sealedBankCreate({ exam, section: "physics", round, chainHash, opensAt, armored: forged }, 0n), intruder, publishedAt + 90_000, NOBODY)

  const b = beacon(round)
  const paper = assemblePaper(banks, b.randomness, round, 5)
  const onPaper = paper.questions.filter((q) => q.section === "chemistry").slice(0, 3)
  const leakText = onPaper.map((q, i) => `Q${i + 1}. ${q.text}`).join("\n")
  insert(leakClaimCreate(exam, opensAt, claimFingerprints(exam, leakText), "Telegram channel selling 'NEET chemistry leak' at Rs 40,000"), address("whistleblower"), opensAt.getTime() - 6 * 60_000)
  insert(leakClaimCreate(exam, opensAt, claimFingerprints(exam, "Q1. Which element has the highest melting point among all metals known\nQ2. Calculate the molarity of a solution made by dissolving salt"), "Forwarded 'leaked paper' PDF"), address("forwarder"), opensAt.getTime() - 3 * 60_000)

  const leaseFrom = mode === "past" ? opensAt.getTime() - 20 * 60_000 : now() - 60_000
  for (const c of CENTRES.slice(0, mode === "soon" ? 2 : 3)) insert(leaseCreate(exam, c.centre, c.state, 3), centreAddr(c.centre), leaseFrom)

  const atBell = async () => {
    const t = opensAt.getTime() + 2500
    insert(beaconCreate(b, opensAt), centreAddr("MUM-01"), t)
    for (const c of CENTRES) {
      const variant = centreVariant(paper, c.centre)
      insert(openedCreate(exam, opensAt, c.centre, paper.hash, variantHash(variant)), centreAddr(c.centre), t + 1000)
    }
    insert(leakClaimCreate(exam, opensAt, claimFingerprints(exam, leakText), "Screenshot 'from before the exam', posted after it"), address("late-poster"), t + 60_000)
  }
  if (mode === "past") await atBell()
  else setTimeout(atBell, opensAt.getTime() + 2500 - now())
}

const minute = 60_000
await seedExam("mock-past", now() - 25 * minute, "past")
await seedExam("mock-soon", now() + BELL_IN * 1000, "soon")
for (let i = 1; i <= 6; i++) await seedExam(`mock-future-${i}`, now() + i * 2 * 3600_000, "future")

// ---------------------------------------------------------------- JSON-RPC + drand over HTTP

function render(e: Stored, select: Record<string, unknown> = { key: true }) {
  const out: Record<string, unknown> = { key: e.key }
  if (select.owner) out.owner = e.owner
  if (select.creator) out.creator = e.creator
  if (select.createdAt) out.createdAt = toHex(e.createdAt)
  if (select.updatedAt) out.updatedAt = toHex(e.createdAt)
  if (select.expiresAt) out.expiresAt = toHex(e.expiresAt)
  if (select.creationFlags) out.creationFlags = { ...e.flags, raw: (e.flags.readonly ? 1 : 0) | (e.flags.permissionlessExtension ? 2 : 0) }
  if (select.contentType) out.contentType = e.contentType
  if (select.payload) out.payload = toHex(e.payload)
  if (select.attributes) out.attributes = e.attributes
  return out
}

function matches(e: Stored, query: string) {
  return query.split(" AND ").every((clause) => {
    const m = /^(\$?\w+) (=|>|<|>=|<=) (\w+)\('?([^')]*)'?\)$/.exec(clause.trim())
    if (!m) throw new Error(`mock cannot parse clause: ${clause}`)
    const [, name, op, , raw] = m
    let actual: unknown
    if (name === "$creator") actual = e.creator
    else if (name === "$owner") actual = e.owner
    else actual = e.attributes.find((a) => a.name === name)?.value
    if (actual === undefined) return false
    const isNum = /^\d+$/.test(raw)
    const a = isNum ? BigInt(actual as string | number) : String(actual).toLowerCase()
    const b = isNum ? BigInt(raw) : raw.toLowerCase()
    return op === "=" ? a === b : op === ">" ? a > b : op === "<" ? a < b : op === ">=" ? a >= b : a <= b
  })
}

function block(n: bigint) {
  const zero = `0x${"0".repeat(64)}`
  return {
    number: toHex(n), hash: `0x${sha256(`b${n}`).toString("hex")}`, parentHash: zero, timestamp: toHex(Math.floor(timeOf(n) / 1000)),
    gasLimit: "0x1c9c380", gasUsed: "0x0", baseFeePerGas: "0x7", miner: `0x${"0".repeat(40)}`, extraData: "0x", logsBloom: `0x${"0".repeat(512)}`,
    transactions: [], uncles: [], difficulty: "0x0", totalDifficulty: "0x0", size: "0x220", nonce: "0x0000000000000000", mixHash: zero,
    sha3Uncles: zero, stateRoot: zero, receiptsRoot: zero, transactionsRoot: zero,
  }
}

function rpc(method: string, params: unknown[]): unknown {
  switch (method) {
    case "eth_chainId":
      return toHex(7738577)
    case "eth_blockNumber":
      return toHex(blockAt(now()))
    case "eth_getBlockByNumber": {
      const tag = params[0] as string
      return block(tag === "latest" || tag === "pending" ? blockAt(now()) : BigInt(tag))
    }
    case "arkiv_query": {
      const [query, options = {}] = params as [string, { atBlock?: string; select?: Record<string, unknown> }]
      const at = options.atBlock ? BigInt(options.atBlock) : blockAt(now())
      const data = db.filter((e) => e.createdAt <= at && e.expiresAt > at && matches(e, query)).map((e) => render(e, options.select))
      return { data, blockNumber: toHex(at) }
    }
    default:
      throw Object.assign(new Error(`method ${method} not supported by the mock`), { code: -32601 })
  }
}

createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*")
  res.setHeader("access-control-allow-headers", "*")
  if (req.method === "OPTIONS") return res.end()
  const url = req.url ?? "/"
  if (url.startsWith(`/drand/${info.hash}`)) {
    const rest = url.slice(`/drand/${info.hash}`.length).split("?")[0]
    res.setHeader("content-type", "application/json")
    if (rest === "/info") return res.end(JSON.stringify(info))
    const m = /^\/public\/(\d+|latest)$/.exec(rest)
    if (m) {
      const round = m[1] === "latest" ? roundAt(now(), info) : Number(m[1])
      if (roundTime(info, round) > now()) {
        res.statusCode = 425
        return res.end(JSON.stringify({ error: "too early" }))
      }
      return res.end(JSON.stringify(beacon(round)))
    }
    res.statusCode = 404
    return res.end("{}")
  }
  let body = ""
  req.on("data", (c) => { body += c })
  req.on("end", () => {
    res.setHeader("content-type", "application/json")
    const handle = (call: { id: number; method: string; params?: unknown[] }) => {
      try {
        return { jsonrpc: "2.0", id: call.id, result: rpc(call.method, call.params ?? []) }
      } catch (err) {
        return { jsonrpc: "2.0", id: call.id, error: { code: (err as { code?: number }).code ?? -32000, message: (err as Error).message } }
      }
    }
    try {
      const parsed = JSON.parse(body || "{}")
      res.end(JSON.stringify(Array.isArray(parsed) ? parsed.map(handle) : handle(parsed)))
    } catch {
      res.statusCode = 400
      res.end("{}")
    }
  })
}).listen(PORT, () => {
  const env = [
    `VITE_RPC_URL=http://localhost:${PORT}`,
    `VITE_WS_URL=ws://localhost:${PORT}/ws`,
    `VITE_BOARD=${board}`,
    `VITE_DRAND_RELAY=http://localhost:${PORT}/drand/${info.hash}`,
    `VITE_DRAND_INFO='${JSON.stringify(info)}'`,
  ].join("\n")
  writeFileSync(new URL("../../.env.mock", import.meta.url), `${env}\n`)
  console.log(`mock Arkiv + drand on :${PORT}; ${db.length} entities; mock-soon bell in ${BELL_IN}s; wrote .env.mock`)
})
