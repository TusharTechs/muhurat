/**
 * Three exam-centre terminals for one exam: verify the sealed banks, hold a readiness lease, open the
 * paper at the bell and post a receipt.
 *
 *   PRIVATE_KEY=0x... npm run centres                    # the next exam by this board
 *   PRIVATE_KEY=0x... npm run centres -- --exam mock-20261019-1000
 *   PRIVATE_KEY=0x... npm run centres -- --drop HZB-01   # one terminal goes silent; its lease lapses
 *
 * PRIVATE_KEY is the board key: it names whose appointments to trust. Centres sign with their own keys.
 */
import type { Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { LEASE_MINUTES, beaconCreate, leakClaimCreate, leaseCreate, listExams, loadBeacons, loadExam, openedCreate, renewLease } from "../src/arkiv"
import { claimFingerprints } from "../src/claims"
import { beaconClient, dateForRound, quicknetClient } from "../src/drand"
import { assemblePaper, centreVariant, variantHash } from "../src/paper"
import type { Bank } from "../src/questions"
import { assertSealedFor, open } from "../src/seal"
import { CENTRES, EXPLORER, LEAKED_SECTION, arg, boardKey, failLoudly, publicClient, roleKeys, wallet } from "./lib"

failLoudly()
const board = privateKeyToAccount(boardKey()).address
const keys = await roleKeys()
const dropped = arg("drop")
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const attr = (e: { attributes?: Record<string, { value: unknown }> }, name: string) => e.attributes?.[name]?.value

let exam = arg("exam")
if (!exam) {
  const upcoming = await listExams(publicClient, board, new Date())
  upcoming.sort((a, b) => Number(attr(a, "opens_at")) - Number(attr(b, "opens_at")))
  if (!upcoming.length) throw new Error(`board ${board} has no upcoming exams; run npm run schedule first`)
  exam = String(attr(upcoming[0], "exam"))
}

const bundle = await loadExam(publicClient, board, exam)
if (!bundle.exam) throw new Error(`exam ${exam} not found for board ${board}`)
const round = Number(attr(bundle.exam, "round"))
const opensAt = dateForRound(round)
const { sections, perSection } = JSON.parse(new TextDecoder().decode(bundle.exam.payload))
console.log(`exam     ${exam}, bell ${opensAt.toISOString()} (round ${round})`)

const armoredBanks = bundle.banks.map((b) => ({ section: String(attr(b, "section")), armored: new TextDecoder().decode(b.payload) }))
for (const b of armoredBanks) assertSealedFor(b.armored, { round })
if (armoredBanks.length !== sections.length) throw new Error(`expected ${sections.length} sealed banks, found ${armoredBanks.length}`)
console.log(`verified ${armoredBanks.length} banks: appointed setters, quicknet, round ${round}; ${bundle.rejected.length} rejected`)

const terminals = CENTRES.map((c) => ({ ...c, wallet: wallet(keys.centres[c.centre] as Hex), lease: undefined as Hex | undefined }))
for (const t of terminals) {
  const { entityKey, txHash } = await t.wallet.createEntity(leaseCreate(exam, t.centre, t.state, armoredBanks.length))
  t.lease = entityKey
  console.log(`armed    ${t.centre} lease ${entityKey.slice(0, 10)}…  ${EXPLORER}/tx/${txHash}`)
}

const renewEvery = (LEASE_MINUTES / 2.5) * 60_000
// A round of renewals can be in flight at the bell; the post-bell writes wait for it, because two
// concurrent sends from one centre wallet race for the same nonce and one of them fails.
let renewing = Promise.resolve()
const renewer = setInterval(() => {
  renewing = (async () => {
    for (const t of terminals) {
      if (t.centre === dropped || !t.lease) continue
      await renewLease(t.wallet, t.lease).then(
        () => console.log(`renewed  ${t.centre} lease`),
        (err) => console.error(`renew    ${t.centre} failed: ${err.message.split("\n")[0]}`),
      )
    }
  })()
}, renewEvery)
if (dropped) console.log(`silent   ${dropped} will stop renewing; its lease lapses in ${LEASE_MINUTES} min`)

const wait = opensAt.getTime() - Date.now()
if (wait > 0) {
  console.log(`waiting  ${Math.ceil(wait / 1000)} s for the bell…`)
  await sleep(wait)
}

// Fetch the round key from drand's relays; if they stay unreachable, use a beacon someone relayed
// on Arkiv (verified against drand's public key before use).
let drand = quicknetClient()
let beacon: { round: number; signature: string; randomness: string } | undefined
for (let attempt = 1; !beacon && attempt <= 120; attempt++) {
  beacon = await drand.get(round).catch(() => undefined)
  if (beacon) break
  if (attempt % 5 === 0) {
    console.log(`waiting  drand round ${round} not reachable yet (attempt ${attempt}); checking Arkiv for a relayed beacon`)
    for (const posted of await loadBeacons(publicClient, round).catch(() => [])) {
      try {
        const candidate = JSON.parse(new TextDecoder().decode(posted.payload))
        drand = await beaconClient(candidate, undefined, round)
        beacon = candidate
        console.log(`beacon   using the round key relayed on Arkiv by ${posted.creator}`)
        break
      } catch {
        // not a valid beacon for this round; ignore it
      }
    }
  }
  if (!beacon) await sleep(2000)
}
if (!beacon) throw new Error(`no key for round ${round} from drand or Arkiv after 4 minutes`)
console.log(`bell     round ${round} key ${beacon.signature.slice(0, 16)}…`)
clearInterval(renewer)
await renewing
const relayer = terminals.find((t) => t.centre !== dropped) ?? terminals[0]
const relay = await relayer.wallet.createEntity(beaconCreate(beacon, opensAt)).catch(() => undefined)
if (relay) console.log(`relayed  beacon on Arkiv ${relay.entityKey.slice(0, 10)}… by ${relayer.centre} (anyone can verify it against drand's key)`)

const banks: Bank[] = []
for (const b of armoredBanks) banks.push(JSON.parse(new TextDecoder().decode(await open(b.armored, { round }, drand))))
const paper = assemblePaper(banks, beacon.randomness, round, perSection)
console.log(`opened   ${paper.questions.length} questions drawn from ${banks.reduce((n, b) => n + b.questions.length, 0)}; paper ${paper.hash.slice(0, 16)}…`)

// Each centre is its own terminal with its own wallet: they post their receipts at the same time.
await Promise.all(
  terminals
    .filter((t) => t.centre !== dropped)
    .map(async (t) => {
      const variant = centreVariant(paper, t.centre)
      const { txHash } = await t.wallet.createEntity(openedCreate(exam, opensAt, t.centre, paper.hash, variantHash(variant)))
      console.log(`receipt  ${t.centre} paper ${paper.hash.slice(0, 12)}… first: "${variant[0].text.slice(0, 50)}…"  ${EXPLORER}/tx/${txHash}`)
    }),
)
if (bundle.claims.length) {
  // Someone reposts the leak after the bell, claiming it was "from before": the court must not accept it.
  const late = banks.find((b) => b.section === LEAKED_SECTION)
  if (late) {
    const text = late.questions.map((q, i) => `Q${i + 1}. ${q.text}`).join("\n")
    await wallet(keys.witnesses.late).createEntity(leakClaimCreate(exam, opensAt, claimFingerprints(exam, text), "Screenshot 'from before the exam', posted after it")).then(
      () => console.log("late     a post-bell claim was filed; the court marks it 'not evidence'"),
      () => {},
    )
  }
}
console.log("\nAll centres opened the same paper at the bell.")
