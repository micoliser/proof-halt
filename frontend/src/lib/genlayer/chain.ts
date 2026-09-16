import { defineChain } from "viem";
import { http } from "wagmi";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  chainIdHex,
  publicEnv,
  STUDIONET_CHAIN_ID,
  STUDIONET_EXPLORER,
  STUDIONET_RPC_URL,
} from "@/lib/env";

export const studionetChain = defineChain({
  id: publicEnv.chainId || STUDIONET_CHAIN_ID,
  name: "GenLayer Studio Next",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: {
    default: { http: [publicEnv.rpcUrl || STUDIONET_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Studio Explorer", url: STUDIONET_EXPLORER },
  },
});

export const wagmiConfig = getDefaultConfig({
  appName: 'Emergency Halt Module',
  projectId: '00000000000000000000000000000000', // Dummy project ID for development
  chains: [studionetChain],
  transports: {
    [studionetChain.id]: http(publicEnv.rpcUrl || STUDIONET_RPC_URL),
  },
  ssr: true,
});

export const studionetWalletParams = {
  chainId: chainIdHex(studionetChain.id),
  chainName: "GenLayer Studio Next",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: [publicEnv.rpcUrl || STUDIONET_RPC_URL],
  blockExplorerUrls: [STUDIONET_EXPLORER],
};


