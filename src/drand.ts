import {
  type ChainClient,
  type ChainInfo,
  type RandomnessBeacon,
  HttpCachingChain,
  HttpChainClient,
  roundAt,
  roundTime,
} from "drand-client"
import { verifyBeacon } from "drand-client/beacon-verification"
import { defaultChainInfo } from "tlock-js"

/**
 * Build-time override, used only by the local end-to-end harness (scripts/mock), which runs its own
 * drand-compatible network. Production builds never set it and always target quicknet.
 */
const override: Record<string, string | undefined> | undefined =
  (import.meta as { env?: Record<string, string | undefined> }).env ?? (typeof process !== "undefined" ? process.env : undefined)

/** drand quicknet: 3 s rounds, BLS signatures on G1 (RFC 9380), the network timelock targets. */
export const QUICKNET: ChainInfo = override?.VITE_DRAND_INFO ? JSON.parse(override.VITE_DRAND_INFO) : defaultChainInfo

/** Public relays for quicknet. Any one of them is enough; the beacon verifies itself. */
export const QUICKNET_RELAYS = override?.VITE_DRAND_RELAY
  ? [override.VITE_DRAND_RELAY]
  : ["https://api.drand.sh", "https://api2.drand.sh", "https://api3.drand.sh", "https://drand.cloudflare.com"].map(
      (base) => `${base}/${QUICKNET.hash}`,
    )

/** The first round whose beacon is published at or after `date`. */
export function roundForDate(date: Date, info: ChainInfo = QUICKNET): number {
  const round = roundAt(date.getTime(), info)
  return roundTime(info, round) < date.getTime() ? round + 1 : round
}

export function dateForRound(round: number, info: ChainInfo = QUICKNET): Date {
  return new Date(roundTime(info, round))
}

/**
 * A quicknet client that tries each relay in turn. Beacon verification stays on and is pinned to
 * the quicknet chain hash and public key, so a lying relay cannot hand us a forged key.
 */
export function quicknetClient(relays: string[] = QUICKNET_RELAYS): ChainClient {
  const clients = relays.map(
    (url) =>
      new HttpChainClient(
        new HttpCachingChain(url, {
          disableBeaconVerification: false,
          noCache: false,
          chainVerificationParams: { chainHash: QUICKNET.hash, publicKey: QUICKNET.public_key },
        }),
      ),
  )
  const firstOf = async <T>(call: (c: ChainClient) => Promise<T>): Promise<T> => {
    let lastError: unknown
    for (const client of clients) {
      try {
        return await call(client)
      } catch (err) {
        lastError = err
      }
    }
    throw lastError
  }
  return {
    options: clients[0].options,
    chain: () => ({ baseUrl: relays[0], info: async () => QUICKNET }),
    latest: () => firstOf((c) => c.latest()),
    get: (round) => firstOf((c) => c.get(round)),
  }
}

/**
 * A client that knows only the chain info. Enough to seal: encryption needs the public key and the
 * round number, never the network.
 */
export function offlineClient(info: ChainInfo = QUICKNET): ChainClient {
  const unavailable = () => Promise.reject(new Error("offline client: no beacons"))
  return {
    options: { disableBeaconVerification: false, noCache: true },
    chain: () => ({ baseUrl: "offline", info: async () => info }),
    latest: unavailable,
    get: unavailable,
  }
}

/**
 * A client serving one beacon that arrived some other way: copied from an Arkiv `beacon` entity,
 * read over the phone, sent by SMS. It is checked against the chain's public key first, so whoever
 * relayed it does not need to be trusted.
 */
export async function beaconClient(
  beacon: RandomnessBeacon,
  info: ChainInfo = QUICKNET,
  expectedRound: number = beacon.round,
): Promise<ChainClient> {
  if (beacon.round !== expectedRound || !(await verifyBeacon(info, beacon, expectedRound))) {
    throw new Error(`beacon for round ${beacon.round} does not verify against chain ${info.hash}`)
  }
  return {
    options: { disableBeaconVerification: false, noCache: true },
    chain: () => ({ baseUrl: "relayed", info: async () => info }),
    latest: async () => beacon,
    get: async (round) => {
      if (round !== beacon.round) throw new Error(`only round ${beacon.round} is available`)
      return beacon
    },
  }
}
