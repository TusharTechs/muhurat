import { createWalletClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { type Address, custom } from "viem"

type Eth = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
const eth = () => (window as unknown as { ethereum?: Eth }).ethereum
const chainId = `0x${tiramisu.id.toString(16)}`

/** Connects MetaMask (or any injected wallet) and switches it to Tiramisu, adding the network if needed. */
export async function connectWallet() {
  const provider = eth()
  if (!provider) throw new Error("No browser wallet found. Install MetaMask to write to Arkiv.")
  const [account] = (await provider.request({ method: "eth_requestAccounts" })) as Address[]
  await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] }).catch(() =>
    provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId,
        chainName: "Arkiv Tiramisu",
        nativeCurrency: { name: "Golem", symbol: "GLM", decimals: 18 },
        rpcUrls: [tiramisu.rpcUrls.default.http[0]],
        blockExplorerUrls: ["https://tiramisu.explorer.arkiv.network"],
      }],
    }),
  )
  return { account, wallet: createWalletClient({ chain: tiramisu, transport: custom(provider), account }) }
}
