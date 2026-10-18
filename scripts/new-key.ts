/** Prints a fresh throwaway key for Tiramisu. Never reuse a key that holds real funds. */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

const key = generatePrivateKey()
console.log(`address      ${privateKeyToAccount(key).address}`)
console.log(`private key  ${key}`)
console.log("\nFund the address at https://hub.arkiv.network/faucet, then run:")
console.log(`  export PRIVATE_KEY=${key}`)
console.log("  npm run spike:live")
