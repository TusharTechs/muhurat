import type { ChainClient } from "drand-client"
import { Buffer, timelockDecrypt, timelockEncrypt } from "tlock-js"
import { QUICKNET } from "./drand"

/** What a sealed payload says about itself, read without decrypting it. */
export type SealHeader = { round: number; chainHash: string }

export class SealRejectedError extends Error {}

/** Timelock-encrypts `plaintext` so nobody can read it before drand publishes `round`. */
export async function seal(plaintext: Uint8Array, round: number, client: ChainClient): Promise<string> {
  return timelockEncrypt(round, Buffer.from(plaintext), client)
}

/**
 * Reads the round and chain a sealed payload targets from its age header.
 *
 * The header is plaintext by design: anyone can see *when* a payload opens, nobody can see *what*
 * it says.
 */
export function readSealHeader(armored: string): SealHeader {
  const body = armored
    .replace(/-----BEGIN AGE ENCRYPTED FILE-----/, "")
    .replace(/-----END AGE ENCRYPTED FILE-----/, "")
    .replace(/\s+/g, "")
  const header = Buffer.from(body, "base64").toString("latin1")
  const stanza = /^-> tlock (\d+) ([0-9a-f]{64})$/m.exec(header)
  if (!header.startsWith("age-encryption.org/v1\n") || !stanza) {
    throw new SealRejectedError("not a tlock age payload")
  }
  return { round: Number(stanza[1]), chainHash: stanza[2] }
}

/**
 * Rejects a payload that does not open at the expected round on drand quicknet.
 *
 * tlock-js does not check the chain itself, so without this a setter could seal to a private drand
 * network whose key they hold, and open "their" paper whenever they liked.
 */
export function assertSealedFor(armored: string, expected: { round: number; chainHash?: string }): SealHeader {
  const header = readSealHeader(armored)
  const chainHash = expected.chainHash ?? QUICKNET.hash
  if (header.chainHash !== chainHash) {
    throw new SealRejectedError(`sealed to chain ${header.chainHash}, expected ${chainHash}`)
  }
  if (header.round !== expected.round) {
    throw new SealRejectedError(`sealed to round ${header.round}, expected ${expected.round}`)
  }
  return header
}

/** Checks the seal, then decrypts. Throws until drand has published the round. */
export async function open(
  armored: string,
  expected: { round: number; chainHash?: string },
  client: ChainClient,
): Promise<Uint8Array> {
  assertSealedFor(armored, expected)
  return new Uint8Array(await timelockDecrypt(armored, client))
}
