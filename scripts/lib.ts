import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { createPublicClient, createWalletClient, type WalletArkivClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { type Hex, formatEther, http, parseEther } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import type { Section } from "../src/questions"

export const EXPLORER = "https://tiramisu.explorer.arkiv.network"
export const SECTION_NAMES: Section[] = ["biology", "chemistry", "physics"]
export const CENTRES = [
  { centre: "MUM-01", state: "Maharashtra" },
  { centre: "PAT-01", state: "Bihar" },
  { centre: "HZB-01", state: "Jharkhand" },
] as const

/** ARKIV_RPC_URL is for the local mock (scripts/mock); unset, the Tiramisu default is used. */
const rpc = () => http(process.env.ARKIV_RPC_URL)
export const publicClient = createPublicClient({ chain: tiramisu, transport: rpc() })
export const wallet = (key: Hex) => createWalletClient({ chain: tiramisu, transport: rpc(), account: privateKeyToAccount(key) })

export function boardKey(): Hex {
  const key = process.env.PRIVATE_KEY as Hex | undefined
  if (!key?.startsWith("0x")) {
    console.error("Set PRIVATE_KEY to the funded board key (0x...).")
    process.exit(1)
  }
  return key
}

/** Role keys live in .keys.json (gitignored), created once and reused, so every exam names the same setters and centres. */
export type RoleKeys = { setters: Record<Section, Hex>; centres: Record<string, Hex>; witnesses?: Record<string, Hex> }
const KEYS_FILE = ".keys.json"

export async function roleKeys(): Promise<RoleKeys & { witnesses: Record<string, Hex> }> {
  if (existsSync(KEYS_FILE)) {
    const keys: RoleKeys = JSON.parse(await readFile(KEYS_FILE, "utf8"))
    if (!keys.witnesses) {
      keys.witnesses = { whistleblower: generatePrivateKey(), forwarder: generatePrivateKey(), late: generatePrivateKey() }
      await writeFile(KEYS_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 })
    }
    return keys as RoleKeys & { witnesses: Record<string, Hex> }
  }
  const keys: RoleKeys = {
    setters: Object.fromEntries(SECTION_NAMES.map((s) => [s, generatePrivateKey()])) as Record<Section, Hex>,
    centres: Object.fromEntries(CENTRES.map((c) => [c.centre, generatePrivateKey()])),
    witnesses: { whistleblower: generatePrivateKey(), forwarder: generatePrivateKey(), late: generatePrivateKey() },
  }
  await writeFile(KEYS_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 })
  return keys as RoleKeys & { witnesses: Record<string, Hex> }
}

/** A demo leak: the chemistry setter's whole bank, as a Telegram channel would post it. */
export const LEAKED_SECTION: Section = "chemistry"
export const FAKE_LEAK = "Q1. Which element has the highest melting point among all metals known\nQ2. Calculate the molarity of a solution made by dissolving common salt"

/** Tops a role key up from the board when it runs low on gas. */
export async function fund(board: WalletArkivClient, key: Hex, label: string, min = "0.05", top = "0.1") {
  const address = privateKeyToAccount(key).address
  const balance = await publicClient.getBalance({ address })
  if (balance >= parseEther(min)) return
  const hash = await board.sendTransaction({ to: address, value: parseEther(top), account: board.account!, chain: tiramisu })
  await publicClient.waitForTransactionReceipt({ hash })
  console.log(`funded   ${label} ${address} +${top} GLM (had ${formatEther(balance)})`)
}

/** The SDK buries the reason a write failed (arkiv/friction.md F1); walk the causes for it. */
export function reasonOf(err: unknown): string {
  const lines: string[] = []
  for (let e = err as { shortMessage?: string; details?: string; message?: string; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    const line = (e.details ?? e.shortMessage ?? e.message ?? "").split("\n")[0]
    if (line && !lines.includes(line)) lines.push(line)
  }
  return lines.join("\n         <- ")
}

export function failLoudly() {
  process.on("unhandledRejection", (err) => {
    console.error(`\nfailed   ${reasonOf(err)}`)
    process.exit(1)
  })
}

export const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}
