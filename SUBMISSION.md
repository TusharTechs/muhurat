# Devfolio submission: answers to paste

Replace every `<…>` before submitting. Tracks to select: **Best Indian Use Case, Security, Censorship Resistance, Privacy, Open Source**. A team can win one prize; entering all five costs nothing.

---

**Project name:** Muhurat (मुहूर्त)

**Tagline:** An exam paper that does not exist, anywhere, until the bell rings.

**The problem it solves**

NEET-UG 2026 was held on 3 May for about 22 lakh candidates and cancelled on 12 May after the paper leaked on Telegram; they all sat it again on 21 June. Before the re-test the Centre restricted Telegram for the whole country under Section 69A, and NTA said Telegram's edit feature had been used to fabricate leak "evidence" after the exam. Maharashtra TET 2026 was cancelled a day before the exam over another leak. Every one of these leaks needs the same thing: a finished paper that exists days before the exam, in a printing press, a trunk, a strong room or an encrypted file whose key someone holds.

Muhurat removes that thing:

- Setters seal question banks in the browser with drand timelock encryption.
- The sealed banks are published on Arkiv as readonly entities owned by `0x…dEaD`: public, impossible to edit, delete or open.
- At the bell, drand's threshold network publishes the round key to the whole world at once.
- Every centre opens the same paper, drawn from the banks by that round's public randomness, so nobody, setters included, knew the paper in advance.
- A leak claim filed on Arkiv before the bell is tested against the opened paper, and its block number proves it came first.

**Challenges I ran into**

- `tlock-js` does not check which drand network a ciphertext targets. A dishonest setter could seal to a private drand network whose key they hold and open their bank early. We read the age header without decrypting and reject anything not sealed to quicknet at the exam's round (`src/seal.ts`, covered by `npm test`).
- Sealing and handing custody to `0x…dEaD` had to be one transaction, so a setter never owns, and so can never delete, a sealed bank. We predict the entity key with `predictEntityKeys` and transfer it in the same `executeBatch`.
- SDK 0.8.1 reports a failed send as "Execution error without revert data", hiding the real cause (see `arkiv/friction.md` F1). We wrote a cause-walking error helper for our scripts.
- Proving a leak claim came before the bell without revealing it: claims carry salted fingerprints of three-word phrases, testable only once the questions exist.

---

### Arkiv questions

**1. Live app URL:** `<https://…>`

**2. Does any team member hold Indian nationality?** Yes

**3. Why Arkiv?**

Muhurat falls apart without three Arkiv properties.

1. **Immutable `$creator` plus readonly payloads.** A centre accepts a bank only if its creator was appointed by the board for that section, and the payload can never change.
   - On Postgres or a vendor API, an insider can quietly swap a sealed bank for one timelocked to an earlier round, or not timelocked at all.
   - IPFS has no authorship and no query by exam, section or creator.
2. **Public, backend-free reads.** On exam morning there is no server to DDoS, block or lean on; any centre or student reads from any RPC. A leak becomes impossible rather than something to censor, so no platform ban is needed.
3. **Public block ordering and lifecycles.** A leak claim's block proves it came before the bell, unlike an edited Telegram screenshot. Evidence lives through the 180-day grievance window and anyone can extend it, while readiness leases die in minutes on their own.

A subgraph would need a custom contract and indexer, and kilobytes of ciphertext per bank on L1 is prohibitive.

**Kept off Arkiv on purpose:**
- Plaintext questions. They exist only in the setter's browser, then nowhere until the bell.
- Candidates, roll numbers, answers and marks.
- Staff identities.
- The decryption itself, which runs on each reader's device.

**4. How do you use Arkiv?** (links are to https://github.com/TusharTechs/muhurat)

- **`$creator` vs appointments** (`src/arkiv.ts` `loadExam`): banks count only from the setter appointed for that section, and receipts only from appointed centres. Everything else is shown as "ignored".
- **`readonly` + `changeOwnership` to `0x…dEaD`** in one **`executeBatch`**, with the key from **`predictEntityKeys`** (`publishSealedBank`). Live proof: the setter's own patch reverts with "owned by 0x…dEaD".
- **Atomic batch for exam + appointments** (`publishExam`). The judge page shows they share a block.
- **Entity Expiration per type** (`arkiv/schema.md`): 10-minute centre leases, and 180 days for exams, banks, receipts, beacons and claims.
- **Lifetime Extension as a lease** (`scripts/centres.ts` `renewLease`): terminals extend every 4 minutes. A silent terminal's tile goes amber, then red.
- **Permissionless extension** on exams, banks, beacons and claims: a litigant can keep evidence alive without changing it.
- **`watchEntityEvents` over WebSocket** (`web/pages/Exam.tsx`): the control room, receipts and court update live.
- **`atBlock`**: every walk pages at a pinned block, and "State at the bell" reads the database at the bell block.
- **Typed numeric attributes + range**: `opens_at`/`round` are `u64`, and upcoming exams come from a `gt` query plus `createdBy(board)`.

**5. Friction report:** https://github.com/TusharTechs/muhurat/blob/main/arkiv/friction.md

**6. Wallet addresses that create your Arkiv entities:**

| Role | Address |
| --- | --- |
| Board (exams, appointments) | `0x97c2a64fEE201647BB667C1857Aee37aC06006d7` |
| Setters (sealed banks) | biology `0xdb7D2d9d2C45ed2586F7619FB4897C3e1f7eCb6E`, chemistry `0x98B9C64a7e1a82E2bbf28a9103eDd0cDb972458C`, physics `0xAB571a9dF98bA446dD45A663537a4469c5c2E811` (also in `arkiv/schedule-evidence.jsonl`) |
| Centres (leases, receipts, beacons) | MUM-01 `0xfd621C831770E5e6D3BEF9773C429784b04BC26f`, PAT-01 `0xe5C7eD05Ab9b1f7fda0251145B95441dB154EefF`, HZB-01 `0xAB18465e39AF3a1e8D6b27B98296A78f19Ad6f90` |
| Witnesses (demo leak claims) | whistleblower `0xeE8c96E90e490e2DdbB99F344F7Dfa39d9bCF63f`, forwarder `0xd141Bc4b632600eCcD501082E76052c3Ee291A46`, late poster `0x7B6886a7dbF07046A066633632Adf69564D97124` |
| Step 1 spike wallet (not the board; used once for the spike) | `0x518dFCA1563A3C64a397509E8C3F71E3F014bA53` (tx `0xa8b1591ebb053eb36eb0b47198534da8d85e572cf1a510fbf9eb64deb922e09b`) |

Print all role addresses with: `npm run addresses`

**7. Link to schema:** https://github.com/TusharTechs/muhurat/blob/main/arkiv/schema.md

**8. How can judges reproduce your Arkiv usage?**

1. Open the live app and pick the next bell. Click "Try to open it now": your browser fails with "too early".
2. Open the last exam that rang. Your browser fetches the round key and opens the paper. Toggle "State at the bell".
3. Open "For judges": every Arkiv feature with live evidence and a code link.
4. Without the app:
   ```sh
   git clone https://github.com/TusharTechs/muhurat && cd muhurat && npm install
   npm test
   npm run verify -- --board 0x97c2a64fEE201647BB667C1857Aee37aC06006d7 --exam mock-20261018-1132
   ```
5. Raw JSON-RPC: see the `curl` in `arkiv/schema.md`.

**9. Pre-existing work you reused:** None. Everything was built between 9 and 18 October 2026. Third-party libraries: `@arkiv-network/sdk`, `viem`, `tlock-js` and `drand-client` (drand), `@noble/curves`, React, Vite, framer-motion, qrcode, tesseract.js.

**10. Arkiv surfaces you used:** TypeScript SDK, WebSocket events, Docs, Hub, Faucet, Block Explorer, Arkiv skills `<add MCP if you ran check_submission>`.

**12. Time to first Arkiv entity:** 2 hours or less `<adjust>`

**13. Which LLMs did you use?** Claude (Anthropic)

**14. The one thing Arkiv should improve first:** Surface the real cause when a write fails before execution. Today SDK 0.8.1 turns network errors, HTTP 413 and 429 into "Execution error without revert data" (friction F1), which sends builders hunting for a revert that never happened. A close second: document the anonymous query budget (about 100 queries an hour per IP) and make the SDK fail fast on it, because today a read just hangs for minutes (friction F3).

**15. Open to a 20-minute feedback call?** Yes

**16 / 17.** Tick both after checking the repo is public, MIT, and every link opens.

**18. Attending Devcon 8?** Yes
