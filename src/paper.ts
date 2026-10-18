import { sha256 } from "@noble/hashes/sha256"
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils"
import type { Bank, Question } from "./questions"

const digest = (...parts: string[]) => bytesToHex(sha256(utf8ToBytes(parts.join("␟"))))

export type PaperQuestion = Question & { section: string }
export type Paper = { exam: string; round: number; questions: PaperQuestion[]; hash: string }

/**
 * Draws `perSection` questions from each bank, ranked by the round's public randomness. Nobody can
 * know the draw before the bell, setters included: the randomness does not exist until drand
 * publishes the round. Anyone can recompute it afterwards.
 */
export function assemblePaper(banks: Bank[], randomness: string, round: number, perSection: number): Paper {
  const ordered = [...banks].sort((a, b) => a.section.localeCompare(b.section))
  const questions = ordered.flatMap((bank) =>
    [...bank.questions]
      .sort((a, b) => digest(randomness, bank.section, a.id).localeCompare(digest(randomness, bank.section, b.id)))
      .slice(0, perSection)
      .map((q) => ({ ...q, section: bank.section })),
  )
  const exam = banks[0]?.exam ?? ""
  return { exam, round, questions, hash: paperHash(questions) }
}

export function paperHash(questions: PaperQuestion[]): string {
  return digest(...questions.map((q) => `${q.section}/${q.id}/${q.text}/${q.options.join("|")}`))
}

/**
 * The order a given centre prints. Same questions everywhere, a different order per centre, so a
 * photo of a printed paper names the centre it came from.
 */
export function centreVariant(paper: Paper, centreCode: string): PaperQuestion[] {
  return [...paper.questions].sort((a, b) =>
    digest(paper.hash, centreCode, a.id).localeCompare(digest(paper.hash, centreCode, b.id)),
  )
}

export function variantHash(questions: PaperQuestion[]): string {
  return digest(...questions.map((q) => q.id))
}

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

const words = (text: string) => new Set(normalise(text).split(" ").filter((w) => w.length > 1))

/** Word-overlap similarity, tolerant of OCR noise and retyping. */
export function similarity(a: string, b: string): number {
  const wa = words(a)
  const wb = words(b)
  if (!wa.size || !wb.size) return 0
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared++
  return shared / Math.min(wa.size, wb.size)
}

export type LeakMatch = { claimed: string; question: PaperQuestion | Question; section: string; score: number; onPaper: boolean }

/**
 * Compares the lines of a claimed leak with the opened banks. A line that matches a question names
 * the bank, and so the setter, it came from; whether it was drawn onto the paper tells a leak of the
 * paper from a leak of a bank.
 */
export function matchLeak(claimText: string, banks: Bank[], paper: Paper, threshold = 0.7): LeakMatch[] {
  const onPaper = new Set(paper.questions.map((q) => `${q.section}/${q.id}`))
  const lines = claimText
    .split(/\n+|(?=\bQ?\d{1,3}[.)]\s)/)
    .map((l) => l.trim())
    .filter((l) => words(l).size >= 4)
  const matches: LeakMatch[] = []
  for (const claimed of lines) {
    let best: LeakMatch | undefined
    for (const bank of banks) {
      for (const q of bank.questions) {
        const score = similarity(claimed, q.text)
        if (score >= threshold && (!best || score > best.score)) {
          best = { claimed, question: q, section: bank.section, score, onPaper: onPaper.has(`${bank.section}/${q.id}`) }
        }
      }
    }
    if (best) matches.push(best)
  }
  return matches
}
