import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { publicEnv, STUDIONET_CHAIN_ID, STUDIONET_RPC_URL } from "@/lib/env";

const fallbackChain = {
  id: STUDIONET_CHAIN_ID,
  isStudio: true,
  name: "Genlayer Studio Network",
  rpcUrls: {
    default: {
      http: [publicEnv.rpcUrl || STUDIONET_RPC_URL],
    },
  },
  nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
};

export function studioChain() {
  return studioDevnet || fallbackChain;
}

export function createReadClient() {
  return createClient({
    chain: studioChain(),
  });
}



export const WRITE_METHODS = {
  registerProtocol: "register_protocol",
  reportExploit: "report_exploit",
  requestUnhalt: "request_unhalt",
  challengeHalt: "challenge_halt",
  finalizeAppeal: "finalize_appeal",
  deposit: "deposit",
  withdraw: "withdraw",
} as const;

export const VIEW_METHODS = {
  getProtocolCount: "get_protocol_count",
  getProtocol: "get_protocol",
  isActionAllowed: "is_action_allowed",
  getBalance: "get_balance",
  getConfig: "get_config",
} as const;
