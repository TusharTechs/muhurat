/** Prints every wallet that creates Muhurat's Arkiv entities, for the Devfolio form. Never prints keys. */
import { privateKeyToAccount } from "viem/accounts"
import { boardKey, roleKeys } from "./lib"

const keys = await roleKeys()
const row = (role: string, key: `0x${string}`) => console.log(`${role.padEnd(24)} ${privateKeyToAccount(key).address}`)
row("board", boardKey())
for (const [s, k] of Object.entries(keys.setters)) row(`setter/${s}`, k)
for (const [c, k] of Object.entries(keys.centres)) row(`centre/${c}`, k)
for (const [w, k] of Object.entries(keys.witnesses)) row(`witness/${w}`, k)
