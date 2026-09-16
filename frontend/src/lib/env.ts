/** Public (browser) config. Sync secret is never read here. */

function trim(value: string | undefined): string {
  return (value ?? "").trim();
}

export const STUDIONET_CHAIN_ID = 61997;
export const STUDIONET_RPC_URL = "https://studio-next.genlayer.com/api";
export const STUDIONET_EXPLORER = "https://explorer-studio-next.genlayer.com";
export const STUDIONET_STUDIO = "https://studio-next.genlayer.com";

export const publicEnv = {
  apiUrl: trim(process.env.NEXT_PUBLIC_API_URL) || "http://localhost:8000",
  haltModuleAddress: trim(process.env.NEXT_PUBLIC_HALT_MODULE_ADDRESS),
  demoVaultAddress: trim(process.env.NEXT_PUBLIC_DEMO_VAULT_ADDRESS),
  rpcUrl: trim(process.env.NEXT_PUBLIC_GENLAYER_RPC_URL) || STUDIONET_RPC_URL,
  chainId: Number(trim(process.env.NEXT_PUBLIC_CHAIN_ID) || STUDIONET_CHAIN_ID),
};

export function contractsConfigured(): boolean {
  return Boolean(publicEnv.haltModuleAddress);
}

export function vaultConfigured(): boolean {
  return Boolean(publicEnv.demoVaultAddress);
}

export function chainIdHex(id: number = publicEnv.chainId): `0x${string}` {
  return `0x${id.toString(16)}`;
}
