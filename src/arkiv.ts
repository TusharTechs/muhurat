import { ExpirationTime, type PublicArkivClient, type WalletArkivClient } from "@arkiv-network/sdk"
import { addr, bytes32, i32, str, u64 } from "@arkiv-network/sdk/attr"
import { and, eq, gt } from "@arkiv-network/sdk/query"
import { type Address, type Hex, sha256, toBytes } from "viem"
import { assertSealedFor } from "./seal"

export const APP = "muhurat"

/** Custody goes here: an address nobody holds a key for, so nobody can delete a sealed bank. */
export const NOBODY: Address = "0x000000000000000000000000000000000000dEaD"

/** Evidence outlives the exam by the results and grievance window. */
export const EVIDENCE_WINDOW_DAYS = 180

/** A centre's readiness lease: it lapses unless the terminal renews it. */
export const LEASE_MINUTES = 10

const evidenceExpiry = (opensAt: Date) =>
  ExpirationTime.atDate(new Date(opensAt.getTime() + EVIDENCE_WINDOW_DAYS * 86_400_000))
const seconds = (d: Date) => u64(BigInt(Math.floor(d.getTime() / 1000)))
const json = (value: unknown) => toBytes(JSON.stringify(value))

// ---------------------------------------------------------------- exam + appointments (board)

export type ExamInput = {
  exam: string
  title: string
  round: number
  chainHash: Hex
  opensAt: Date
  sections: string[]
  perSection: number
}

export type AppointmentInput =
  | { role: "setter"; member: Address; section: string }
  | { role: "centre"; member: Address; centre: string; state: string }

export function examCreate(e: ExamInput) {
  return {
    payload: json({ title: e.title, sections: e.sections, perSection: e.perSection }),
    contentType: "application/json",
    attributes: {
      app: str(APP),
      kind: str("exam"),
      exam: str(e.exam),
      round: u64(BigInt(e.round)),
      chain: bytes32(e.chainHash),
      opens_at: seconds(e.opensAt),
      per_section: i32(e.perSection),
    },
    flags: { readonly: true, permissionlessExtension: true },
    expires: evidenceExpiry(e.opensAt),
  }
}

export function appointmentCreate(exam: string, opensAt: Date, a: AppointmentInput) {
  return {
    payload: new Uint8Array(),
    contentType: "application/json",
    attributes: {
      app: str(APP),
      kind: str("appointment"),
      exam: str(exam),
      role: str(a.role),
      member: addr(a.member),
      ...(a.role === "setter" ? { section: str(a.section) } : { centre: str(a.centre), state: str(a.state) }),
    },
    flags: { readonly: true },
    expires: evidenceExpiry(opensAt),
  }
}

/** The exam and everyone appointed to it land in one transaction. */
export async function publishExam(wallet: WalletArkivClient, e: ExamInput, appointments: AppointmentInput[]) {
  return wallet.executeBatch({
    creates: [examCreate(e), ...appointments.map((a) => appointmentCreate(e.exam, e.opensAt, a))],
  })
}

// ---------------------------------------------------------------- sealed banks (setters)

export type SealedBankInput = {
  exam: string
  section: string
  round: number
  chainHash: Hex
  opensAt: Date
  armored: string
}

/** The create for a sealed bank: readonly, kept alive by anyone, expiring after the grievance window. */
export function sealedBankCreate(bank: SealedBankInput, salt: bigint) {
  const payload = toBytes(bank.armored)
  return {
    payload,
    contentType: "text/plain",
    attributes: {
      app: str(APP),
      kind: str("sealed_bank"),
      exam: str(bank.exam),
      section: str(bank.section),
      round: u64(BigInt(bank.round)),
      chain: bytes32(bank.chainHash),
      opens_at: seconds(bank.opensAt),
      ct_sha256: bytes32(sha256(payload)),
    },
    flags: { readonly: true, permissionlessExtension: true },
    expires: evidenceExpiry(bank.opensAt),
    salt,
  }
}

/**
 * Seals a bank in one transaction: create it, then hand it to {@link NOBODY}. The key is predicted
 * first so the transfer in the same batch can name the entity it has not created yet. Either both
 * land or neither does, so there is no moment when the setter still owns a sealed bank.
 */
export async function publishSealedBank(
  publicClient: PublicArkivClient,
  walletClient: WalletArkivClient,
  bank: SealedBankInput,
): Promise<{ entityKey: Hex; txHash: Hex }> {
  assertSealedFor(bank.armored, { round: bank.round, chainHash: bank.chainHash.slice(2) })
  const owner = walletClient.account!.address
  const [{ key, salt }] = await publicClient.predictEntityKeys({ owner, count: 1 })
  const result = await walletClient.executeBatch({
    creates: [sealedBankCreate(bank, salt)],
    ownershipChanges: [{ entityKey: key, newOwner: NOBODY }],
  })
  const [minted] = result.createdEntities
  if (minted !== key) {
    throw new Error(`predicted ${key} but the engine minted ${minted}; another create from ${owner} landed first`)
  }
  return { entityKey: key, txHash: result.txHash }
}

// ---------------------------------------------------------------- centres

export function leaseCreate(exam: string, centre: string, state: string, banksOk: number) {
  return {
    payload: new Uint8Array(),
    contentType: "application/json",
    attributes: {
      app: str(APP),
      kind: str("centre_ready"),
      exam: str(exam),
      centre: str(centre),
      state: str(state),
      banks_ok: i32(banksOk),
    },
    expires: ExpirationTime.fromMinutes(LEASE_MINUTES),
  }
}

/** Renewing pushes the lease to now + LEASE_MINUTES. A silent terminal's lease simply lapses. */
export const renewLease = (wallet: WalletArkivClient, entityKey: Hex) =>
  wallet.extendEntity({ entityKey, expires: ExpirationTime.fromMinutes(LEASE_MINUTES) })

export function openedCreate(exam: string, opensAt: Date, centre: string, paperHash: string, variantHash: string) {
  return {
    payload: new Uint8Array(),
    contentType: "application/json",
    attributes: {
      app: str(APP),
      kind: str("opened"),
      exam: str(exam),
      centre: str(centre),
      paper_sha256: bytes32(`0x${paperHash}`),
      variant_sha256: bytes32(`0x${variantHash}`),
    },
    flags: { readonly: true },
    expires: evidenceExpiry(opensAt),
  }
}

/** A relayed round key. Anyone may post one: it verifies against drand's public key, not its poster. */
export function beaconCreate(beacon: { round: number; signature: string; randomness: string }, opensAt: Date) {
  return {
    payload: json(beacon),
    contentType: "application/json",
    attributes: { app: str(APP), kind: str("beacon"), round: u64(BigInt(beacon.round)) },
    flags: { readonly: true, permissionlessExtension: true },
    expires: evidenceExpiry(opensAt),
  }
}

// ---------------------------------------------------------------- leak claims (anyone)

/**
 * A sealed leak claim: fingerprints of the claimed questions (see src/claims.ts), filed by anyone.
 * Its block number is the evidence; readonly so it cannot be edited after the bell, and anyone can
 * keep it alive for as long as a case runs.
 */
export function leakClaimCreate(exam: string, opensAt: Date, fingerprints: string[], note: string) {
  return {
    payload: json({ v: 1, fingerprints, note: note.slice(0, 140) }),
    contentType: "application/json",
    attributes: { app: str(APP), kind: str("leak_claim"), exam: str(exam), phrases: i32(fingerprints.length) },
    flags: { readonly: true, permissionlessExtension: true },
    expires: evidenceExpiry(opensAt),
  }
}

// ---------------------------------------------------------------- reads

const FULL = { key: true, creator: true, owner: true, creationFlags: true, createdAt: true, expiresAt: true, attributes: true, payload: true } as const

/**
 * Every match, paged at one pinned block: cursors from an unpinned head can be rejected mid-walk, and
 * a pinned block is also how we read the database "as it was at the bell".
 */
async function all(publicClient: PublicArkivClient, where: ReturnType<typeof and>, createdBy?: Address, at?: bigint) {
  const query = publicClient.select(FULL).where(where).limit(200).atBlock(at ?? (await publicClient.getBlockNumber({ cacheTime: 0 })))
  if (createdBy) query.createdBy(createdBy)
  const out = []
  for await (const entity of query) out.push(entity)
  return out
}

export type Entity = Awaited<ReturnType<typeof all>>[number]

/** Exams by a board that open after `since`. */
export const listExams = (publicClient: PublicArkivClient, board: Address, since: Date) =>
  all(publicClient, and(eq("app", APP), eq("kind", "exam"), gt("opens_at", seconds(since))), board)

/**
 * Everything about one exam, trusting only what the board's appointments allow: banks from appointed
 * setters for their own section, leases and receipts from appointed centres. Anything else is
 * returned separately as `rejected`, so the UI can show it was seen and ignored.
 */
export async function loadExam(publicClient: PublicArkivClient, board: Address, exam: string, at?: bigint) {
  const block = at ?? (await publicClient.getBlockNumber({ cacheTime: 0 }))
  // One query for every record of the exam, split by kind here: the public RPC meters anonymous
  // reads per query (arkiv/friction.md F3), so six queries per refresh was six times the budget.
  const records = await all(publicClient, and(eq("app", APP), eq("exam", exam)), undefined, block)
  const attr = (e: Entity, name: string) => e.attributes?.[name]?.value
  const fromBoard = (e: Entity) => e.creator.toLowerCase() === board.toLowerCase()
  const byKind = (kind: string) => records.filter((e) => attr(e, "kind") === kind)
  const examEntity = byKind("exam").find(fromBoard)
  const appointments = byKind("appointment").filter(fromBoard)
  const banks = byKind("sealed_bank")
  const leases = byKind("centre_ready")
  const receipts = byKind("opened")
  const claims = byKind("leak_claim")
  // One wallet may hold several appointments (e.g. setter for every section), so trust is a set of
  // (member, section) and (member, centre) pairs, not a map from member to one role.
  const setterPairs = new Set<string>()
  const centrePairs = new Set<string>()
  for (const a of appointments) {
    const member = String(attr(a, "member")).toLowerCase()
    if (attr(a, "role") === "setter") setterPairs.add(`${member}|${attr(a, "section")}`)
    if (attr(a, "role") === "centre") centrePairs.add(`${member}|${attr(a, "centre")}`)
  }
  // A bank counts only if an appointed setter created it for their section AND it is out of
  // everyone's hands: readonly, owned by nobody. One bank per section: the earliest wins.
  const sealedRight = (b: Entity) => b.creationFlags?.readonly === true && b.owner?.toLowerCase() === NOBODY.toLowerCase()
  const appointedBank = (b: Entity) => setterPairs.has(`${b.creator.toLowerCase()}|${attr(b, "section")}`) && sealedRight(b)
  const firstPerSection = new Map<string, Entity>()
  for (const b of [...banks].sort((x, y) => Number(x.createdAt - y.createdAt))) {
    const section = String(attr(b, "section"))
    if (appointedBank(b) && !firstPerSection.has(section)) firstPerSection.set(section, b)
  }
  const trustedBanks = new Set(firstPerSection.values())
  const trustedCentre = (e: Entity) => centrePairs.has(`${e.creator.toLowerCase()}|${attr(e, "centre")}`)
  return {
    block,
    exam: examEntity,
    appointments,
    banks: [...trustedBanks],
    leases: leases.filter(trustedCentre),
    receipts: receipts.filter(trustedCentre),
    /** Claims come from anyone: what makes one evidence is its block, not its author. */
    claims,
    rejected: [...banks.filter((b) => !trustedBanks.has(b)), ...leases.filter((l) => !trustedCentre(l)), ...receipts.filter((r) => !trustedCentre(r))],
  }
}

/** Relayed beacons for a round, from anyone. The caller verifies each before use. */
export const loadBeacons = (publicClient: PublicArkivClient, round: number) =>
  all(publicClient, and(eq("app", APP), eq("kind", "beacon"), eq("round", u64(BigInt(round)))))

/** Sealed banks for an exam from the given setters only. */
export async function fetchSealedBanks(publicClient: PublicArkivClient, exam: string, setters: Address[]) {
  const trusted = new Set(setters.map((s) => s.toLowerCase()))
  const banks = await all(publicClient, and(eq("app", APP), eq("kind", "sealed_bank"), eq("exam", exam)))
  return banks.filter((b) => trusted.has(b.creator.toLowerCase()))
}
