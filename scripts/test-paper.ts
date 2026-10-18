/** Offline checks for paper assembly, centre variants and leak matching. */
import assert from "node:assert/strict"
import { claimFingerprints, testClaim, verdict } from "../src/claims"
import { assemblePaper, centreVariant, matchLeak, variantHash } from "../src/paper"
import { bankFor } from "../src/questions"

const exam = "mock-test"
const banks = (["biology", "chemistry", "physics"] as const).map((s) => bankFor(exam, s))
const r1 = "a".repeat(64)
const r2 = "b".repeat(64)

const p1 = assemblePaper(banks, r1, 100, 5)
assert.equal(p1.questions.length, 15)
assert.deepEqual(assemblePaper([...banks].reverse(), r1, 100, 5), p1, "same randomness, same paper, whatever the bank order")
assert.notEqual(assemblePaper(banks, r2, 100, 5).hash, p1.hash, "different randomness draws a different paper")
console.log("  ok  the draw is fixed by the round's randomness and nothing else")

const mum = centreVariant(p1, "MUM-01")
const pat = centreVariant(p1, "PAT-01")
assert.deepEqual(new Set(mum.map((q) => q.id)), new Set(p1.questions.map((q) => q.id)))
assert.notEqual(variantHash(mum), variantHash(pat))
console.log("  ok  every centre prints the same questions in its own order")

const leaked = `PAPER LEAKED 100% REAL\nQ1. ${p1.questions[0].text}\nQ2) ${p1.questions[7].text.toUpperCase()}\nQ3. the weather today is pleasant and sunny outside`
const matches = matchLeak(leaked, banks, p1)
assert.equal(matches.length, 2)
assert.ok(matches.every((m) => m.onPaper))
const offPaper = banks[0].questions.find((q) => !p1.questions.some((p) => p.id === q.id))!
const bankLeak = matchLeak(`1. ${offPaper.text}`, banks, p1)
assert.equal(bankLeak[0].onPaper, false)
assert.equal(bankLeak[0].section, "biology")
assert.equal(matchLeak("Q1. Find the capital of France and explain why it matters", banks, p1).length, 0)
console.log("  ok  leak claims match real questions, name their section, and ignore noise")

const bankText = banks[1].questions.map((q, i) => `Q${i + 1}. ${q.text}`).join("\n")
const fps = claimFingerprints(exam, bankText)
assert.ok(fps.every((f) => /^[0-9a-f]{16}$/.test(f)), "claims hold fingerprints, not text")
assert.ok(!fps.some((f) => bankText.includes(f)))
assert.notDeepEqual(claimFingerprints("other-exam", bankText), fps, "fingerprints are salted per exam")
const hits = testClaim(exam, fps, banks, p1)
assert.equal(hits.length, 15)
assert.ok(hits.every((h) => h.section === "chemistry"))
assert.equal(verdict(hits, true), "proven")
assert.equal(verdict(hits, false), "after-bell")
assert.equal(verdict(testClaim(exam, claimFingerprints(exam, "Q1. Which element has the highest melting point among all metals known"), banks, p1), true), "no-match")
const offOnly = banks[1].questions.filter((q) => !p1.questions.some((p) => p.id === q.id)).map((q) => q.text).join("\n")
assert.equal(verdict(testClaim(exam, claimFingerprints(exam, offOnly), banks, p1), true), "bank-leak")
console.log("  ok  sealed claims: salted fingerprints, proven / bank-leak / no-match / after-bell")
