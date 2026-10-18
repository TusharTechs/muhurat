# Muhurat (मुहूर्त)

**An exam paper that does not exist, anywhere, until the bell rings.**

Setters seal question banks in the browser with [drand](https://drand.love) timelock encryption. The sealed banks are published on [Arkiv](https://arkiv.network), the Web3 database, as readonly entities owned by `0x…dEaD`: publicly readable, impossible to edit, delete or open. At the bell, drand's threshold network publishes the round key to the whole world at once. Every centre opens the same paper, drawn from the banks by that round's public randomness. Before the bell nobody can read it: not the board, not the setters, not us. Nobody chose the final paper.

Built for **Arkiv: Global Tour Stop** (9 to 18 Oct 2026) on the road to Devcon 8 Mumbai. Tracks: **Best Indian Use Case** (primary), Security, Censorship Resistance, Privacy, Open Source.

| | |
| --- | --- |
| Live app | _add your deployment URL_ |
| Demo video (≤ 3 min) | _add link_ ([script](VIDEO.md)) |
| Data contract | [`arkiv/schema.md`](arkiv/schema.md) |
| Friction report | [`arkiv/friction.md`](arkiv/friction.md) |
| On-chain evidence | [`arkiv/evidence-spike.json`](arkiv/evidence-spike.json), `arkiv/schedule-evidence.jsonl`, live on the app's "For judges" page |
| Board wallet | [`0x97c2a64fEE201647BB667C1857Aee37aC06006d7`](https://tiramisu.explorer.arkiv.network/address/0x97c2a64fEE201647BB667C1857Aee37aC06006d7): creates every exam and appointment |
| Step 1 spike wallet | [`0x518dFCA1563A3C64a397509E8C3F71E3F014bA53`](https://tiramisu.explorer.arkiv.network/address/0x518dFCA1563A3C64a397509E8C3F71E3F014bA53): used once for the spike in `evidence-spike.json`, not the board |
| Devfolio answers | [`SUBMISSION.md`](SUBMISSION.md) |

## Why India, why now

- **3 May 2026:** NEET-UG was held for about 22 lakh candidates. **12 May:** it was cancelled over a paper leak on Telegram, and everyone sat it again on 21 June.
- **June 2026:** before the re-test the Centre restricted Telegram for all of India under Section 69A, and the Delhi High Court upheld it. NTA said Telegram's edit feature had been used to fabricate leak "evidence" after the exam.
- **August 2026:** Maharashtra TET was cancelled a day before the exam over a leak.
- The Radhakrishnan committee proposed sending encrypted papers to centre servers and printing them just before the exam. That still needs someone to hold and release the key. **Muhurat removes the key holder.**

## What a judge can do, no wallet needed

1. **Home:** a live countdown to the next sealed paper (papers open every two hours through judging week), with drand's round ticking locally.
2. **Exam page:**
   - **"Try to open it now":** your browser asks drand for the key and is refused, because it does not exist yet.
   - **The bell:** the wax seal cracks, an optional temple bell rings, and the paper opens in your browser at the same second as everywhere else.
   - **Booklet:** the paper as each centre prints it, in that centre's own question order, with a QR code that verifies the copy. "Print this paper" gives a clean exam sheet.
   - **Control room:** centre terminals renew 10-minute leases; a silent one goes amber, then red.
   - **Leak court:** sealed claims filed before the bell are tested against the paper: proven leak, bank leak (names the setter), false claim, or filed after the bell (not evidence).
   - **"State at the bell":** the database as it was at the bell block.
3. **Leak checker:**
   - Paste a "leaked paper", or upload a screenshot; OCR runs on your device in English and Hindi.
   - Before the bell the verdict is "fake, it cannot exist yet", and you can file it as a sealed claim.
   - After the bell, matching lines name the setter's bank they came from.
4. **For judges:** every Arkiv feature in the rubric, with evidence computed live from the RPC and a link to the code.
5. **Run your own exam** (MetaMask + faucet GLM): be the board and setters, seal three banks to a bell minutes away, and watch it open.
6. **Hindi:** the language toggle in the nav switches the main screens.

## How it uses Arkiv

| Feature | Where | What the user sees |
| --- | --- | --- |
| `$creator` vs appointments | `loadExam`, [`src/arkiv.ts`](src/arkiv.ts) | "appointed" badges; records from unappointed wallets counted as ignored |
| `readonly` + `changeOwnership` to `0x…dEaD` in one `executeBatch`, key from `predictEntityKeys` | `publishSealedBank` | "nobody can delete it"; even the setter's own edit reverts (friction F2) |
| Atomic batch: exam + appointments | `publishExam` | the judge page shows they share one block |
| Entity Expiration per type | [`arkiv/schema.md`](arkiv/schema.md) | 10-minute leases; 180-day evidence |
| `extendEntity` as a lease | `renewLease`, [`scripts/centres.ts`](scripts/centres.ts) | control-room tiles and lease bars |
| `permissionlessExtension` | exams, banks, beacons, claims | anyone can keep evidence alive for a case |
| `watchEntityEvents` over WebSocket | [`web/pages/Exam.tsx`](web/pages/Exam.tsx) | live updates, no refresh loop |
| `atBlock` | pinned paging + "State at the bell" | the database at the bell |
| Numeric attributes + range + `createdBy` | `listExams` | the schedule of upcoming exams |

**Why Arkiv, not Postgres, IPFS or our own API:**
- An operator can swap a sealed bank for one timelocked to an earlier round, or not timelocked at all. They can also withhold the paper on exam morning.
- IPFS has no authorship, no query by exam, section or creator, and no leases.
- Muhurat falls apart without an immutable `$creator`, frozen payloads and public block ordering for leak claims.

**Kept off Arkiv:** plaintext questions, candidates, staff, and the decryption itself.

## Security notes

- **Chain check.** `tlock-js` does not check which drand chain a ciphertext targets, so a setter could seal to a private drand network they control and open their bank early. [`src/seal.ts`](src/seal.ts) reads the age header without decrypting and rejects anything not sealed to drand quicknet at the exam's round.
- **Relayed round keys** (beacon entities on Arkiv) are verified against drand's public key before use, so whoever relays them does not need to be trusted.
- **Leak claims** carry salted phrase fingerprints, never text.

## Run it

Node 22+. Put the funded Tiramisu board key in `.env` as `PRIVATE_KEY=0x…`; it is gitignored, and so is `.keys.json` (role keys).

```sh
npm install
npm test                                   # offline: draw, variants, claims, sealing, chain/round guard, batch shape
npm run dev                                # the app at http://localhost:5173

npm run schedule -- --in 4 --leak          # board: one exam, bell in 4 min, plus two sealed leak claims
npm run centres                            # 3 centres: arm, renew leases, open at the bell, post receipts
npm run centres -- --drop HZB-01           # same, one terminal goes silent
npm run schedule -- --every 2 --until 2026-10-23T18:00:00Z   # papers for judging week
npm run verify -- --board 0x… --exam <id>  # independent reader, no app
npm run addresses                          # every wallet that writes entities (for the form)
npm run video -- --live                    # the demo video, with live footage (see VIDEO.md)
```

**Offline end-to-end:**
- `npm run mock` runs a local Arkiv-compatible RPC plus a drand-compatible relay, seeded with real sealed exams.
- `npx vite --mode mock` runs the app against it.
- `npm run e2e` drives every screen in Chromium, including a live bell.

**Deploy:** push to GitHub, set the repository variable `VITE_BOARD` to the board address, and enable Pages with "GitHub Actions" as the source. [`.github/workflows/pages.yml`](.github/workflows/pages.yml) builds and publishes on every push. Any static host works too: `VITE_BOARD=0x… npm run build`, then serve `dist/`.

## Trust assumptions

- **drand quicknet** is a threshold network. A quorum of its operators colluding could open a round early.
- **Tiramisu** has a single sequencer.
- **Setters know their own questions.** The bell-time draw (5 of 15 per section) and per-bank attribution limit what one setter can leak.
- **Printing before the bell** opens a window at each centre. Per-centre question order makes a photographed copy traceable to its centre.

All question content is synthetic demo data written for this project. No personal data is stored. MIT licence.
