import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { type Address, http, webSocket } from "viem"
import { type Entity, loadBeacons, loadExam } from "../src/arkiv"
import { beaconClient, dateForRound, quicknetClient } from "../src/drand"
import { type Paper, assemblePaper } from "../src/paper"
import type { Bank } from "../src/questions"
import { open } from "../src/seal"

export const EXPLORER = "https://tiramisu.explorer.arkiv.network"

/** The board whose exams this deployment shows. Override with ?board=0x... */
export const DEFAULT_BOARD = (import.meta.env.VITE_BOARD || "0x97c2a64fEE201647BB667C1857Aee37aC06006d7") as Address

const RPC = import.meta.env.VITE_RPC_URL as string | undefined
const WS = import.meta.env.VITE_WS_URL as string | undefined
/**
 * No transport retries: on a 429 viem sleeps for Retry-After (about 100 s) before each retry, which
 * froze the page for minutes. The pages re-read on their own schedule, so failing fast is the retry.
 */
export const publicClient = createPublicClient({ chain: tiramisu, transport: http(RPC, { retryCount: 0 }) })
/** A real socket: watchEntityEvents only streams over WebSocket, and silently polls over HTTP. */
export const liveClient = createPublicClient({ chain: tiramisu, transport: webSocket(WS) })

export type ExamBundle = Awaited<ReturnType<typeof loadExam>>
export { loadExam }

export const attr = (e: Entity | undefined, name: string) => e?.attributes?.[name]?.value
export const text = (e: Entity) => new TextDecoder().decode(e.payload)
export const examInfo = (e: Entity) => {
  const round = Number(attr(e, "round"))
  return { id: String(attr(e, "exam")), round, opensAt: dateForRound(round), ...JSON.parse(text(e)) as { title: string; sections: string[]; perSection: number } }
}

/**
 * The first block at or after `date`, found by searching block timestamps (blocks are ~2 s), or
 * undefined while the chain has not reached `date` yet. The chain's clock decides, not this browser's.
 */
export async function blockAt(date: Date): Promise<bigint | undefined> {
  const target = BigInt(Math.floor(date.getTime() / 1000))
  const head = await publicClient.getBlock()
  if (head.timestamp < target) return undefined
  let lo = head.number - (head.timestamp - target) / 2n - 120n
  let hi = head.number
  if (lo < 0n) lo = 0n
  while (lo < hi) {
    const mid = (lo + hi) / 2n
    const block = await publicClient.getBlock({ blockNumber: mid })
    if (block.timestamp < target) lo = mid + 1n
    else hi = mid
  }
  return lo
}

export type Opened = { paper: Paper; banks: Bank[]; beacon: { round: number; signature: string; randomness: string }; via: "drand" | "arkiv" }

/**
 * Opens an exam in this browser. The round key comes from drand's relays, or failing that from a
 * beacon someone posted on Arkiv; either way it is checked against drand's public key first.
 */
export async function openExam(bundle: ExamBundle): Promise<Opened> {
  const { round, perSection } = examInfo(bundle.exam!)
  let client = quicknetClient()
  let via: Opened["via"] = "drand"
  let beacon = await client.get(round).catch(() => undefined)
  // drand normally answers within a second of the bell; the Arkiv relay is for when its relays are
  // unreachable, and each look there spends a metered query, so wait 10 s before trying it.
  if (!beacon && Date.now() > dateForRound(round).getTime() + 10_000) {
    for (const posted of await loadBeacons(publicClient, round)) {
      try {
        const candidate = JSON.parse(text(posted))
        // Anyone can post a "beacon": only one that verifies for exactly this round is used.
        if (candidate?.round !== round) continue
        client = await beaconClient(candidate, undefined, round)
        beacon = candidate
        via = "arkiv"
        break
      } catch {
        // a relayed beacon that does not verify is ignored
      }
    }
  }
  if (!beacon) throw new Error(`It's too early to decrypt the ciphertext - decryptable at round ${round}`)
  const banks: Bank[] = []
  for (const b of bundle.banks) banks.push(JSON.parse(new TextDecoder().decode(await open(text(b), { round }, client))))
  return { paper: assemblePaper(banks, beacon.randomness, round, perSection), banks, beacon, via }
}

/** Tries to open before the bell. Always fails, and says why, in the visitor's own browser. */
export async function tryEarly(bundle: ExamBundle): Promise<string> {
  const bank = bundle.banks[0]
  if (!bank) return "No sealed bank found."
  const { round } = examInfo(bundle.exam!)
  return open(text(bank), { round }, quicknetClient()).then(
    () => "It opened: the bell has rung.",
    (err: Error) => err.message,
  )
}

export function boardFromUrl(): Address {
  const q = new URLSearchParams(location.hash.split("?")[1] ?? "")
  return (q.get("board") as Address) || DEFAULT_BOARD
}
