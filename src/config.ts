/** Site metadata. */

export const SITE_NAME = "Squeekchain Arcade";
export const SITE_DESCRIPTION =
  "Free browser puzzle games with a Squeekchain twist. Play Number Slide on Sepolia, where the contract checks every winning run.";

/** Where players get free Sepolia test ETH. No seed phrase or private key is ever needed. */
export const FAUCETS = [
  { name: "Google Cloud Sepolia faucet", href: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia" },
  { name: "Alchemy Sepolia faucet", href: "https://www.alchemy.com/faucets/ethereum-sepolia" },
] as const;
