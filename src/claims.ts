import { sha256 } from "@noble/hashes/sha256"
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils"
import type { Paper } from "./paper"
import type { Bank, Question } from "./questions"

/**
 * A leak claim filed before the bell holds fingerprints, not text: salted hashes of every three-word
 * phrase in the claimed questions. Before the bell nobody can learn anything from them, because
 * nobody has the questions to compare against. After the bell anyone can test them against the
 * opened banks. The claim's block number then proves it came first, which edited screenshots cannot.
 */
const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean)

export function phrases(text: string, n = 3): string[] {
  const w = words(text)
  if (w.length < n) return w.length ? [w.join(" ")] : []
  return Array.from({ length: w.length - n + 1 }, (_, i) => w.slice(i, i + n).join(" "))
}

const fingerprint = (exam: string, phrase: string) => bytesToHex(sha256(utf8ToBytes(`${exam}␟${phrase}`))).slice(0, 16)

export function claimFingerprints(exam: string, text: string): string[] {
  return [...new Set(phrases(text).map((p) => fingerprint(exam, p)))]
}

export type ClaimMatch = { question: Question; section: string; score: number; onPaper: boolean }

/** Questions whose phrases are mostly present in the claim. */
export function testClaim(exam: string, fingerprints: string[], banks: Bank[], paper: Paper, threshold = 0.6): ClaimMatch[] {
  const claimed = new Set(fingerprints)
  const onPaper = new Set(paper.questions.map((q) => `${q.section}/${q.id}`))
  const matches: ClaimMatch[] = []
  for (const bank of banks) {
    for (const question of bank.questions) {
      const own = [...new Set(phrases(question.text).map((p) => fingerprint(exam, p)))]
      const score = own.filter((f) => claimed.has(f)).length / own.length
      if (score >= threshold) matches.push({ question, section: bank.section, score, onPaper: onPaper.has(`${bank.section}/${question.id}`) })
    }
  }
  return matches
}

export type ClaimVerdict = "proven" | "bank-leak" | "no-match" | "after-bell"

/** What a claim proves, given when it was filed relative to the bell. */
export function verdict(matches: ClaimMatch[], filedBeforeBell: boolean): ClaimVerdict {
  if (!filedBeforeBell) return "after-bell"
  if (matches.some((m) => m.onPaper)) return "proven"
  return matches.length ? "bank-leak" : "no-match"
}

/**
 * Reads a claim's payload defensively: claims come from anyone, so a malformed one must read as an
 * empty claim, never crash the reader.
 */
export function parseClaim(payload: Uint8Array | undefined): { fingerprints: string[]; note: string } {
  try {
    const body = JSON.parse(new TextDecoder().decode(payload)) as { fingerprints?: unknown; note?: unknown } | null
    const fingerprints = Array.isArray(body?.fingerprints)
      ? body.fingerprints.filter((f): f is string => typeof f === "string" && /^[0-9a-f]{16}$/.test(f)).slice(0, 5000)
      : []
    const note = typeof body?.note === "string" ? body.note.slice(0, 140) : ""
    return { fingerprints, note }
  } catch {
    return { fingerprints: [], note: "" }
  }
}
