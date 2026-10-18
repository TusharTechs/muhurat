# Muhurat data contract on Arkiv

Network: Tiramisu testnet, chain ID `7738577`. SDK: `@arkiv-network/sdk` 0.8.1. Source of truth: [`src/arkiv.ts`](../src/arkiv.ts).

Every entity carries `app = "muhurat"` and a `kind`. All names are lowercase snake_case. Timestamps are `u64` Unix seconds. drand rounds are `u64`. Anyone can read every entity from the public RPC; nothing here needs our backend, because there is none.

## Trust model in one paragraph

The **board** is a wallet. Its `exam` and `appointment` entities are trusted only when their `$creator` is the board. A `sealed_bank` counts only if its `$creator` was appointed setter **for that same section**. `centre_ready` and `opened` count only if their `$creator` was appointed centre **for that same centre code**. Attributes such as `section` or `centre` can be copied by anyone; `$creator` cannot. Everything else is shown as "ignored" (`loadExam(...).rejected`). `leak_claim` is deliberately open to anyone: what makes a claim evidence is its **block**, before or after the bell, not its author.

## Entity types

| `kind` | Created by | Attributes (type) | Payload | Flags | Expiration |
| --- | --- | --- | --- | --- | --- |
| `exam` | board | `exam` str, `round` u64, `chain` bytes32 (drand chain hash), `opens_at` u64, `per_section` i32 | JSON `{title, sections[], perSection}` | readonly, permissionless extension | bell + 180 days |
| `appointment` | board | `exam` str, `role` str (`setter` / `centre`), `member` addr, then `section` str (setter) or `centre` str + `state` str (centre) | empty | readonly | bell + 180 days |
| `sealed_bank` | appointed setter | `exam` str, `section` str, `round` u64, `chain` bytes32, `opens_at` u64, `ct_sha256` bytes32 | tlock (age, armored) ciphertext of the section's question bank JSON | readonly, permissionless extension; **owner handed to `0x…dEaD` in the same transaction** | bell + 180 days |
| `centre_ready` | appointed centre | `exam` str, `centre` str, `state` str, `banks_ok` i32 | empty | none | **10 minutes**, renewed by `extendEntity` every 4 minutes while the terminal is alive |
| `beacon` | anyone | `round` u64 | JSON `{round, signature, randomness}` from drand | readonly, permissionless extension | bell + 180 days |
| `leak_claim` | anyone (whistleblower) | `exam` str, `phrases` i32 | JSON `{v, fingerprints[], note}`: salted SHA-256 (16 hex) of every three-word phrase in the claimed questions; `note` is an optional public label the filer types (where they saw it), never the claimed text | readonly, permissionless extension | bell + 180 days |
| `opened` | appointed centre | `exam` str, `centre` str, `paper_sha256` bytes32, `variant_sha256` bytes32 | empty | readonly | bell + 180 days |

### Why each lifetime

- **bell + 180 days:** results, grievances and court challenges take months. With permissionless extension, a litigant can keep the evidence alive without being able to change it.
- **10-minute lease:** a centre that stops renewing drops off the control room by itself. No server tracks heartbeats.

## Writes

| Who | Transaction | Atomicity |
| --- | --- | --- |
| Board | `executeBatch({ creates: [exam, ...appointments] })` | The exam never exists without its appointments |
| Setter | `predictEntityKeys` then `executeBatch({ creates: [sealed_bank], ownershipChanges: [{ key, newOwner: 0x…dEaD }] })` | There is no moment when the setter still owns, and so could delete, a sealed bank |
| Whistleblower | `createEntity(leak_claim)` from the leak checker (MetaMask) before the bell | — |
| Centre | `createEntity(centre_ready)`, then `extendEntity` every 4 min; at the bell `createEntity(beacon)` (one centre) and `createEntity(opened)` | — |

## Queries the app runs

All reads page with cursors at **one pinned block** (`atBlock`), because cursors from an unpinned head can be rejected mid-walk.

```ts
// Upcoming and recent exams by a board (range on a numeric attribute + creator filter)
select().where(and(eq("app","muhurat"), eq("kind","exam"), gt("opens_at", u64(sinceSeconds)))).createdBy(board).atBlock(head)

// Everything for one exam; trust is applied afterwards using $creator against the appointments
select().where(and(eq("app","muhurat"), eq("kind", k), eq("exam", examId))).atBlock(head)       // k in exam | appointment | sealed_bank | centre_ready | opened | leak_claim
// (exam and appointment additionally .createdBy(board))

// "State at the bell": the same queries at the first block at or after the bell
select()....atBlock(bellBlock)

// Relayed round keys (verified client-side against drand's public key before use)
select().where(and(eq("app","muhurat"), eq("kind","beacon"), eq("round", u64(round))))
```

Live updates use `watchEntityEvents` over a **WebSocket** transport, with no `fromBlock`. Any event triggers a debounced re-read, so leases, renewals and receipts appear without a refresh loop.

### Leak claims and privacy

A claim reveals nothing before the bell: its fingerprints are salted with the exam id, and nobody has the questions to compare against. After the bell, `testClaim` (`src/claims.ts`) recomputes the fingerprints of every opened question. A question counts as matched when 60% of its phrases are present. The verdict is:

- **proven** if the claim was filed before the bell and matches questions drawn onto the paper;
- **bank-leak** if it was filed before the bell and matches only undrawn questions;
- **no-match** if nothing matches;
- **after-bell** if it was filed after the bell (not evidence).

## Kept off Arkiv on purpose

- **Plaintext questions.** They exist only in the setter's browser before sealing, and nowhere until the bell.
- **Candidates.** No names, roll numbers, admit cards, answers or marks.
- **Centre staff identities.** A centre is an institution code.
- **Decryption.** It happens on each reader's device.
- **The time oracle.** That is drand quicknet, a threshold network. Its trust assumption is stated, alongside Tiramisu's single sequencer.

## Reproduce

```sh
npm install
npm test                                   # offline: sealing, chain/round guard, batch shape, paper draw, leak claims
PRIVATE_KEY=0x... npm run schedule -- --in 3 --leak   # board publishes an exam opening in 3 min; setters seal 3 banks; two sealed leak claims
PRIVATE_KEY=0x... npm run centres              # 3 centres arm, renew leases, open at the bell, post receipts
npm run dev                                    # the app, reading only from the public RPC
npm run verify -- --board 0x... --exam <id>    # independent reader: trust checks, opens after the bell, tests claims
```

Raw read without any of our code (JSON-RPC; the query string is exactly what the SDK renders):

```sh
curl -s https://rpc.tiramisu.db-chain.testnet.arkiv.network -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["app = str('"'"'muhurat'"'"') AND kind = str('"'"'exam'"'"')",{"select":{"key":true,"creator":true,"attributes":true},"limit":"0x14"}]}'
```
