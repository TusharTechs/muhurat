# AGENTS.md

Guide for AI coding agents working on Muhurat.

## What this is

Exam papers sealed with drand timelock encryption (`tlock-js`) and stored on Arkiv (`@arkiv-network/sdk` 0.8.1, Tiramisu testnet, chain 7738577). Nothing can be decrypted before the drand round of the bell.

## Map

| Path | Role |
| --- | --- |
| `src/arkiv.ts` | Every entity type Muhurat writes, and `loadExam`, which applies the `$creator` trust rules. The data contract lives in `arkiv/schema.md`; keep the two in sync |
| `src/seal.ts` | Seal, header check, open. Always call `assertSealedFor` before trusting a ciphertext (tlock-js does not check the chain) |
| `src/paper.ts`, `src/claims.ts` | Deterministic paper draw, centre variants, leak matching, sealed-claim fingerprints and verdicts |
| `scripts/` | Operator scripts (`schedule`, `centres`, `verify`, `addresses`, `spike-live`) and tests (`test-paper`, `spike-offline`) |
| `scripts/mock/` | Local Arkiv + drand stand-in and the Playwright end-to-end run. Test-only |
| `web/` | React app: `chain.ts` (clients, open/try-early), `components.tsx`, `pages/*` |

## Rules

- Attribute names: lowercase snake_case. Timestamps and rounds: `u64`. What you filter on goes in attributes; the payload is not queryable.
- Trust comes from `$creator` checked against the board's appointments, never from an attribute anyone can write.
- Never put keys, secrets or real personal data in an entity. Keys live in `.env` and `.keys.json` (both gitignored). Question content is synthetic.
- Say "Entity Expiration" and "Lifetime Extension", never "TTL".
- Before committing, run `npx tsc --noEmit` and `npm test`. For UI changes, also run `npm run e2e`, which needs no network.
