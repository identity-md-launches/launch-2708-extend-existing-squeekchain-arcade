import { createConfig, fallback, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { SITE_NAME } from "../config";

/**
 * Number Slide sessions live on Ethereum Sepolia (chain 11155111), a test network: transactions
 * cost only Sepolia test ETH. Public RPCs only; the site holds no keys.
 */
export const chain = sepolia;
export const PUBLIC_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
export const EXPLORER = "https://sepolia.etherscan.io";

export const config = createConfig({
  chains: [chain],
  // EIP-6963 discovery lists every installed extension under its own name
  multiInjectedProviderDiscovery: true,
  connectors: [injected(), coinbaseWallet({ appName: SITE_NAME })],
  transports: { [chain.id]: fallback([http(PUBLIC_RPC_URL), http("https://sepolia.gateway.tenderly.co")]) },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
