"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useGenLayerWrite } from "@/hooks/useGenLayerWrite";
import { syncAll, syncProtocol } from "@/lib/api";
import { humanizeTxError, isUserRejection } from "@/lib/receipt";
import type { ProtocolDetail } from "@/lib/types";

export type TxPhase =
  | "IDLE"
  | "CONFIRMING"
  | "SUBMITTED"
  | "SYNCING"
  | "CONFIRMED"
  | "FAILED"
  | "UNDETERMINED";

export interface ExecuteOptions {
  value?: bigint;
  confirmingMessage?: string;
  submittedMessage?: string;
  reviewingMessage?: string;
  confirmedMessage?: string;
  /** Fast-path indexer sync after the receipt (halt-module writes). */
  syncProtocolId?: number | (() => number | null | undefined);
  syncAll?: boolean;
  onTxHash?: (hash: string) => void;
  onConfirmed?: (ctx: {
    txHash: string;
    receipt: unknown;
    returnedId: number | null;
    protocol: ProtocolDetail | null;
  }) => Promise<void> | void;
}

function isConfirmationFlake(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("could not confirm") ||
    lower.includes("timed out") ||
    lower.includes("failed to fetch") ||
    lower.includes("refresh the page")
  );
}

async function runPostConfirmSync(
  opts: ExecuteOptions | undefined,
  setTxPhase: (p: TxPhase) => void,
  toastId: string | number,
): Promise<ProtocolDetail | null> {
  let protocol: ProtocolDetail | null = null;
  const syncId =
    typeof opts?.syncProtocolId === "function"
      ? opts.syncProtocolId()
      : opts?.syncProtocolId;

  if (opts?.syncAll || syncId != null) {
    setTxPhase("SYNCING");
    toast.loading("Updating status…", { id: toastId });
    await sleep(1000);
    try {
      if (opts?.syncAll) {
        await syncAll();
      }
      if (syncId != null && syncId >= 0) {
        const res = await syncProtocol(syncId);
        protocol = res.protocol;
      }
    } catch (syncErr) {
      toast.warning(
        `Confirmed, but status may take a moment to update: ${humanizeTxError(syncErr)}. Refresh shortly.`,
        { id: toastId, duration: 10_000 },
      );
    }
  }
  return protocol;
}

export function useTransaction() {
  const { submitTransaction } = useGenLayerWrite();
  const [txPhase, setTxPhase] = useState<TxPhase>("IDLE");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const reset = useCallback(() => {
    setTxPhase("IDLE");
    setError(null);
    setTxHash(null);
  }, []);

  const execute = useCallback(
    async (
      contractAddress: string,
      functionName: string,
      args: unknown[],
      opts?: ExecuteOptions,
    ) => {
      setTxPhase("CONFIRMING");
      setError(null);
      setTxHash(null);

      const toastId = toast.loading(
        opts?.confirmingMessage || "Confirm the transaction in wallet…",
      );
      let slowTimer: ReturnType<typeof setTimeout> | undefined;
      let submittedHash: string | null = null;

      try {
        const { txHash: hash, receipt, returnedId } = await submitTransaction(
          contractAddress,
          functionName,
          args,
          (hashFromWallet) => {
            submittedHash = hashFromWallet;
            setTxHash(hashFromWallet);
            setTxPhase("SUBMITTED");
            opts?.onTxHash?.(hashFromWallet);
            toast.loading(
              opts?.submittedMessage || "Submitted. Waiting for confirmation…",
              { id: toastId },
            );
            slowTimer = setTimeout(() => {
              toast.loading(
                opts?.reviewingMessage ||
                  "Validators are reviewing evidence… this can take 30–60s.",
                { id: toastId },
              );
            }, 20_000);
          },
          opts?.value,
        );

        if (slowTimer) clearTimeout(slowTimer);

        const execName = String(
          (receipt as { txExecutionResultName?: string }).txExecutionResultName ?? "",
        );
        if (execName && execName !== "FINISHED_WITH_RETURN" && execName !== "FINISHED_WITH_ERROR") {
          setTxPhase("UNDETERMINED");
          toast.warning(
            "Submitted, but the outcome is unclear. Wait a moment and refresh.",
            { id: toastId, duration: 10_000 },
          );
          return { txHash: hash, receipt, returnedId, protocol: null as ProtocolDetail | null };
        }

        const protocol = await runPostConfirmSync(opts, setTxPhase, toastId);

        if (opts?.onConfirmed) {
          setTxPhase("SYNCING");
          await opts.onConfirmed({ txHash: hash, receipt, returnedId, protocol });
        }

        setTxPhase("CONFIRMED");
        toast.success(opts?.confirmedMessage || "Transaction confirmed.", {
          id: toastId,
        });
        return { txHash: hash, receipt, returnedId, protocol };
      } catch (err) {
        if (slowTimer) clearTimeout(slowTimer);
        const message = humanizeTxError(err);

        // Tx may already be on-chain while browser confirmation polling failed.
        // Still try to refresh UI status so users are not stuck on a spinner.
        if (submittedHash && isConfirmationFlake(message) && !isUserRejection(message)) {
          try {
            const protocol = await runPostConfirmSync(opts, setTxPhase, toastId);
            if (opts?.onConfirmed) {
              await opts.onConfirmed({
                txHash: submittedHash,
                receipt: null,
                returnedId: null,
                protocol,
              });
            }
            setTxPhase("CONFIRMED");
            toast.success(
              opts?.confirmedMessage ||
                "Transaction submitted. Status updated — refresh if something looks stale.",
              { id: toastId },
            );
            return {
              txHash: submittedHash,
              receipt: null,
              returnedId: null,
              protocol,
            };
          } catch {
            /* fall through to failure */
          }
        }

        setTxPhase("FAILED");
        setError(message);
        toast.error(message, {
          id: toastId,
          duration: isUserRejection(message) ? 5000 : 12_000,
        });
        return null;
      }
    },
    [submitTransaction],
  );

  const isLocked =
    txPhase === "CONFIRMING" || txPhase === "SUBMITTED" || txPhase === "SYNCING";

  return { execute, txPhase, isLocked, error, txHash, reset };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
