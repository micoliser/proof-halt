"use client";

import { useCallback, useState } from "react";
import { useAccount, useWalletClient, useSwitchChain } from "wagmi";
import { createClient } from "genlayer-js";
import { createReadClient, studioChain } from "@/lib/genlayer/client";
import { studionetChain } from "@/lib/genlayer/chain";
import {
  asOnchainId,
  extractExecutionError,
  extractWriteReturn,
  humanizeTxError,
} from "@/lib/receipt";

export function useGenLayerWrite() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitTransaction = useCallback(
    async (
      contractAddress: string,
      functionName: string,
      args: unknown[],
      onTxHash?: (hash: string) => void,
      value?: bigint,
    ) => {
      if (!isConnected || !address) {
        throw new Error("Connect wallet first.");
      }
      if (!contractAddress) {
        throw new Error("Contract address is not configured.");
      }

      setIsPending(true);
      setError(null);
      try {
        if (chainId !== studionetChain.id) {
          await switchChainAsync({ chainId: studionetChain.id });
        }

        if (!walletClient) {
          throw new Error("No ethereum provider found.");
        }

        // Create a genlayer-js client with wallet provider for signing
        const client = createClient({
          chain: studioChain(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          provider: walletClient as any,
          account: address as `0x${string}`,
        });

        // Build the write call parameters
        const write = {
          address: contractAddress as `0x${string}`,
          functionName,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          args: args as any[],
          ...(value !== undefined ? { value } : {}),
        };

        // Use estimateTransactionFeesForWrite to simulate the actual
        // transaction and auto-discover child messages (emit_transfer etc.)
        // This is the documented approach from:
        // https://docs.genlayer.com/developers/decentralized-applications/genlayer-js
        const estimate = await client.estimateTransactionFeesForWrite(write);

        // Submit with the estimated fees
        const genlayerTxId = await client.writeContract({
          ...write,
          fees: {
            distribution: estimate.distribution,
            messageAllocations: estimate.messageAllocations,
            feeValue: estimate.feeValue,
          },
        });

        onTxHash?.(genlayerTxId);

        // Wait for a decision
        const readClient = createReadClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const receipt = await readClient.waitForDecision({ hash: genlayerTxId as any }) as any;

        if (receipt.txExecutionResultName === "FINISHED_WITH_ERROR" || receipt.txExecutionResult === 2) {
          const detail = extractExecutionError(receipt);
          throw new Error(
            detail ||
              "This action was rejected on-chain. Your balance was not changed.",
          );
        }

        const returned = extractWriteReturn(receipt);
        const returnedId = asOnchainId(returned);

        return { txHash: genlayerTxId, receipt, returned, returnedId };
      } catch (err) {
        const message = humanizeTxError(err);
        setError(message);
        throw new Error(message);
      } finally {
        setIsPending(false);
      }
    },
    [address, isConnected, chainId, walletClient, switchChainAsync],
  );

  return { submitTransaction, isPending, error };
}
