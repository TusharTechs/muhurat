/**
 * The board: publishes exams and has the appointed setters seal their banks.
 *
 *   PRIVATE_KEY=0x... npm run schedule -- --in 3            # one exam, bell in 3 minutes (demo recording)
 *   PRIVATE_KEY=0x... npm run schedule -- --every 2 --until 2026-10-23T18:00:00Z   # judging week
 *
 * Every exam: one transaction for the exam + 6 appointments (board), then one transaction per
 * section, each sealing that section's bank and handing it to 0x...dEaD (setter).
 */
import { appendFile, mkdir } from "node:fs/promises"
import type { Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { type AppointmentInput, leakClaimCreate, listExams, loadExam, publishExam, publishSealedBank } from "../src/arkiv"
import { claimFingerprints } from "../src/claims"
import { QUICKNET, dateForRound, offlineClient, roundForDate } from "../src/drand"
import { bankFor } from "../src/questions"
import { seal } from "../src/seal"
import { CENTRES, EXPLORER, FAKE_LEAK, LEAKED_SECTION, SECTION_NAMES, arg, boardKey, failLoudly, fund, publicClient, roleKeys, wallet } from "./lib"

failLoudly()
const board = wallet(boardKey())
const keys = await roleKeys()
const PER_SECTION = 5

const slots: Date[] = []
if (arg("in")) {
  slots.push(new Date(Date.now() + Number(arg("in")) * 60_000))
} else {
  const everyH = Number(arg("every") ?? 2)
  const until = new Date(arg("until") ?? "2026-10-23T18:00:00Z")
  const first = new Date()
  first.setUTCMinutes(0, 0, 0)
  first.setUTCHours(Math.ceil((first.getUTCHours() + 1) / everyH) * everyH)
  // A slot needs time to be sealed before its bell: skip any less than 10 minutes away.
  for (let t = first.getTime(); t <= until.getTime(); t += everyH * 3_600_000) if (t - Date.now() >= 10 * 60_000) slots.push(new Date(t))
}

const existing = new Set(
  (await listExams(publicClient, board.account!.address, new Date())).map((e) => String(e.attributes?.exam?.value)),
)
const appointments: AppointmentInput[] = [
  ...SECTION_NAMES.map((section) => ({ role: "setter" as const, member: privateKeyToAccount(keys.setters[section]).address, section })),
  ...CENTRES.map((c) => ({ role: "centre" as const, member: privateKeyToAccount(keys.centres[c.centre]).address, ...c })),
]

console.log(`board    ${board.account!.address}`)
console.log(`exams    ${slots.length} slot(s), ${existing.size} already published\n`)
const withLeak = process.argv.includes("--leak")
/** Tops role wallets up as needed; called per exam so long schedules never run a wallet dry. */
async function topUp() {
  for (const section of SECTION_NAMES) await fund(board, keys.setters[section], `setter/${section}`, "0.02", "0.1")
  for (const c of CENTRES) await fund(board, keys.centres[c.centre], `centre/${c.centre}`, "0.02", "0.05")
  if (withLeak) for (const [name, key] of Object.entries(keys.witnesses)) await fund(board, key, `witness/${name}`, "0.005", "0.03")
}

await mkdir("arkiv", { recursive: true })
for (const slot of slots) {
  const round = roundForDate(slot)
  const opensAt = dateForRound(round)
  const exam = `mock-${opensAt.toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-")}`
  const chainHash: Hex = `0x${QUICKNET.hash}`
  let missing = SECTION_NAMES
  let published: { txHash: Hex; createdEntities: Hex[] } | undefined
  if (existing.has(exam)) {
    // Resume an exam an earlier run left half-sealed, instead of skipping it forever.
    const have = new Set((await loadExam(publicClient, board.account!.address, exam)).banks.map((b) => String(b.attributes?.section?.value)))
    missing = SECTION_NAMES.filter((section) => !have.has(section))
    if (!missing.length) {
      console.log(`skip     ${exam} (already published and sealed)`)
      continue
    }
    if (opensAt.getTime() - Date.now() < 60_000) {
      console.log(`skip     ${exam}: missing ${missing.join(", ")} but the bell is too close to seal now`)
      continue
    }
    console.log(`resume   ${exam}: sealing missing ${missing.join(", ")}`)
    await topUp()
  } else {
    await topUp()
    published = await publishExam(
      board,
      { exam, title: "Demo NEET-style mock (synthetic questions)", round, chainHash, opensAt, sections: SECTION_NAMES, perSection: PER_SECTION },
      appointments,
    )
    console.log(`exam     ${exam} opens ${opensAt.toISOString()} round ${round}  ${EXPLORER}/tx/${published.txHash}`)
  }

  const banks: Record<string, { entityKey: Hex; txHash: Hex }> = {}
  for (const section of missing) {
    const armored = await seal(new TextEncoder().encode(JSON.stringify(bankFor(exam, section))), round, offlineClient())
    banks[section] = await publishSealedBank(publicClient, wallet(keys.setters[section]), { exam, section, round, chainHash, opensAt, armored })
    console.log(`  sealed ${section.padEnd(9)} ${banks[section].entityKey}`)
  }
  if (withLeak && published) {
    const leaked = bankFor(exam, LEAKED_SECTION).questions.map((q, i) => `Q${i + 1}. ${q.text}`).join("\n")
    await wallet(keys.witnesses.whistleblower).createEntity(leakClaimCreate(exam, opensAt, claimFingerprints(exam, leaked), "Telegram channel selling a 'NEET chemistry leak' at Rs 40,000"))
    await wallet(keys.witnesses.forwarder).createEntity(leakClaimCreate(exam, opensAt, claimFingerprints(exam, FAKE_LEAK), "Forwarded 'leaked paper' PDF"))
    console.log("  filed  2 sealed leak claims (one real chemistry bank leak, one fake)")
  }
  await appendFile(
    "arkiv/schedule-evidence.jsonl",
    `${JSON.stringify({ exam, round, opensAt: opensAt.toISOString(), examTx: published?.txHash, examKey: published?.createdEntities[0], banks })}\n`,
  )
}
console.log("\nDone. Evidence appended to arkiv/schedule-evidence.jsonl")
