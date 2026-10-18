/**
 * An independent reader: checks an exam straight from the public Arkiv RPC, without the app, and
 * opens it if the bell has rung. No key needed.
 *
 *   npm run verify -- --board 0x... --exam mock-20261019-1000
 *   npm run verify -- --board 0x...                  # lists the board's exams
 */
import type { Address } from "viem"
import { listExams, loadExam } from "../src/arkiv"
import { parseClaim, testClaim, verdict } from "../src/claims"
import { dateForRound, quicknetClient } from "../src/drand"
import { assemblePaper } from "../src/paper"
import type { Bank } from "../src/questions"
import { assertSealedFor, open } from "../src/seal"
import { arg, publicClient, reasonOf } from "./lib"

const board = arg("board") as Address | undefined
if (!board) {
  console.error("usage: npm run verify -- --board 0x... [--exam <id>]")
  process.exit(1)
}
const attr = (e: { attributes?: Record<string, { value: unknown }> }, n: string) => e.attributes?.[n]?.value
const ok = (cond: boolean, line: string) => console.log(`  ${cond ? "✓" : "✗"} ${line}`)

try {
  const exam = arg("exam")
  if (!exam) {
    const exams = await listExams(publicClient, board, new Date(Date.now() - 7 * 86_400_000))
    for (const e of exams.sort((a, b) => Number(attr(a, "opens_at")) - Number(attr(b, "opens_at")))) {
      const at = dateForRound(Number(attr(e, "round")))
      console.log(`${String(attr(e, "exam")).padEnd(24)} ${at.toISOString()}  ${at.getTime() < Date.now() ? "opened" : "sealed"}`)
    }
    process.exit(0)
  }

  const b = await loadExam(publicClient, board, exam)
  if (!b.exam) throw new Error(`no exam ${exam} by ${board}`)
  const round = Number(attr(b.exam, "round"))
  const opensAt = dateForRound(round)
  const { sections, perSection } = JSON.parse(new TextDecoder().decode(b.exam.payload))
  console.log(`${exam} · bell ${opensAt.toISOString()} · drand quicknet round ${round} · read at block ${b.block}\n`)

  const setters = b.appointments.filter((a) => attr(a, "role") === "setter")
  ok(b.appointments.every((a) => a.createdAt === b.exam!.createdAt), `exam and ${b.appointments.length} appointments landed in one transaction (block ${b.exam.createdAt})`)
  ok(b.banks.length === sections.length, `${b.banks.length}/${sections.length} sealed banks from appointed setters (${setters.length} appointed); ${b.rejected.length} record(s) ignored`)
  for (const bank of b.banks) {
    const armored = new TextDecoder().decode(bank.payload)
    let sealedRight = true
    try {
      assertSealedFor(armored, { round })
    } catch {
      sealedRight = false
    }
    ok(
      sealedRight && bank.creationFlags.readonly && bank.owner.toLowerCase().endsWith("dead"),
      `${String(attr(bank, "section")).padEnd(9)} sealed to quicknet round ${round}, readonly, owned by 0x…dEaD, created by ${bank.creator}`,
    )
  }

  if (Date.now() < opensAt.getTime()) {
    console.log(`\nSealed. Opens in ${Math.ceil((opensAt.getTime() - Date.now()) / 1000)} s; until then nobody can decrypt it.`)
    process.exit(0)
  }

  const drand = quicknetClient()
  const beacon = await drand.get(round)
  const banks: Bank[] = []
  for (const bank of b.banks) banks.push(JSON.parse(new TextDecoder().decode(await open(new TextDecoder().decode(bank.payload), { round }, drand))))
  const paper = assemblePaper(banks, beacon.randomness, round, perSection)
  console.log(`\nOpened with round ${round}'s key: ${paper.questions.length} questions, paper ${paper.hash}`)
  for (const r of b.receipts) ok(String(attr(r, "paper_sha256")).slice(2) === paper.hash, `receipt from ${String(attr(r, "centre"))} matches`)
  for (const c of b.claims) {
    const body = parseClaim(c.payload)
    const filed = await publicClient.getBlock({ blockNumber: c.createdAt })
    const v = verdict(testClaim(exam, body.fingerprints, banks, paper), Number(filed.timestamp) * 1000 < opensAt.getTime())
    console.log(`  · claim at block ${c.createdAt}: ${v}  "${body.note}"`)
  }
  console.log(`\nFirst question: ${paper.questions[0].text}`)
} catch (err) {
  console.error(`failed: ${reasonOf(err)}`)
  process.exit(1)
}
