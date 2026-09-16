"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { StatusBadge } from "@/components/StatusBadge";
import { TxStatus } from "@/components/TxStatus";
import { Card, Field, GhostButton, PrimaryButton, TextInput } from "@/components/ui";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useTransaction } from "@/hooks/useTransaction";
import { getProtocol, syncProtocol } from "@/lib/api";
import { publicEnv, vaultConfigured } from "@/lib/env";
import { formatGen, parseGen } from "@/lib/format";
import { WRITE_METHODS } from "@/lib/genlayer/client";
import {
  readIsActionAllowed,
  readVaultBalance,
  readVaultConfig,
} from "@/lib/genlayer/views";
import { ApiError } from "@/lib/types";

export default function VaultPage() {
  const mounted = useHasMounted();
  const { address, isConnected } = useAccount();
  const qc = useQueryClient();
  const { execute, txPhase, isLocked, error, txHash, reset } = useTransaction();
  const [amount, setAmount] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const configQ = useQuery({
    queryKey: ["vault-config"],
    queryFn: readVaultConfig,
    enabled: vaultConfigured(),
  });

  const protocolId = configQ.data?.protocol_id;
  const protocolQ = useQuery({
    queryKey: ["protocol", protocolId],
    queryFn: () => getProtocol(protocolId as number),
    enabled: protocolId != null,
    retry: (count, err) => {
      if (err instanceof ApiError && err.status === 404) return false;
      return count < 1;
    },
  });

  const balanceQ = useQuery({
    queryKey: ["vault-balance", address],
    queryFn: () => readVaultBalance(address as string),
    enabled: Boolean(address) && vaultConfigured(),
  });

  const allowedQ = useQuery({
    queryKey: ["withdraw-allowed", protocolId],
    queryFn: () => readIsActionAllowed(protocolId as number, "withdraw"),
    enabled: protocolId != null && Boolean(publicEnv.haltModuleAddress),
  });

  const protocolHalted =
    protocolQ.data?.status === "HALTED" || protocolQ.data?.is_halted === true;
  const withdrawBlocked = allowedQ.data === false || protocolHalted;

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["vault-balance"] }),
      qc.invalidateQueries({ queryKey: ["withdraw-allowed"] }),
      qc.invalidateQueries({ queryKey: ["vault-config"] }),
      protocolId != null
        ? qc.invalidateQueries({ queryKey: ["protocol", protocolId] })
        : Promise.resolve(),
    ]);
  };

  const parseAmount = (): bigint | null => {
    try {
      const value = parseGen(amount);
      if (value <= BigInt(0)) {
        setLocalError("Enter an amount greater than 0.");
        return null;
      }
      return value;
    } catch {
      setLocalError("Enter an amount in GEN, for example 0.1");
      return null;
    }
  };

  const onDeposit = async () => {
    setLocalError(null);
    reset();
    if (!isConnected) {
      setLocalError("Connect wallet first.");
      return;
    }
    const value = parseAmount();
    if (value == null) return;
    await execute(publicEnv.demoVaultAddress, WRITE_METHODS.deposit, [], {
      value,
      confirmingMessage: "Confirm deposit in wallet…",
      submittedMessage: "Deposit submitted…",
      confirmedMessage: "Deposit confirmed.",
      onConfirmed: refresh,
    });
  };

  const onWithdraw = async () => {
    setLocalError(null);
    reset();
    if (!isConnected) {
      setLocalError("Connect wallet first.");
      return;
    }
    if (withdrawBlocked) {
      setLocalError(
        "Withdrawals are paused while this protocol is halted. Deposits still work.",
      );
      return;
    }
    const value = parseAmount();
    if (value == null) return;
    if (balanceQ.data !== undefined && value > balanceQ.data) {
      setLocalError(`Insufficient balance. You only have ${formatGen(balanceQ.data)} GEN.`);
      return;
    }
    await execute(publicEnv.demoVaultAddress, WRITE_METHODS.withdraw, [value], {
      confirmingMessage: "Confirm withdrawal in wallet…",
      submittedMessage: "Withdrawal submitted…",
      confirmedMessage: "Withdrawal confirmed.",
      onConfirmed: refresh,
    });
  };

  const onRefreshProtocol = async () => {
    if (protocolId == null) return;
    try {
      const res = await syncProtocol(protocolId);
      if (res.protocol) qc.setQueryData(["protocol", protocolId], res.protocol);
      await allowedQ.refetch();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Could not refresh status.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Demo Vault</h1>
        <p className="text-sm text-muted">
          Deposit GEN anytime. Withdrawals are frozen while the linked protocol is
          halted, that is the safety demo. This page talks to one vault address,
          a newly registered protocol needs its own deploy. See the{" "}
          <Link href="/guide" className="text-accent underline-offset-2 hover:underline">
            developer guide
          </Link>
          .
        </p>
      </div>

      {!vaultConfigured() && (
        <Card>
          <p className="text-sm text-warn">
            The vault is not configured yet. Ask the team to finish deployment, then
            reload this page.
          </p>
        </Card>
      )}

      {configQ.isError && (
        <p className="text-sm text-halted">
          Could not load the vault. Check your connection and try again.
        </p>
      )}

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Linked protocol</p>
            {protocolId == null ? (
              <p className="text-sm text-muted">
                {configQ.isLoading ? "Loading…" : "Unknown"}
              </p>
            ) : (
              <Link
                href={`/protocols/${protocolId}`}
                className="text-lg font-medium hover:underline"
              >
                {protocolQ.data?.name || `Protocol ${protocolId}`}
              </Link>
            )}
          </div>
          {protocolQ.data ? (
            <StatusBadge status={protocolQ.data.status} />
          ) : protocolQ.isError ? (
            <GhostButton onClick={onRefreshProtocol}>Refresh status</GhostButton>
          ) : null}
        </div>
      </Card>

      {withdrawBlocked && (
        <Card className="border-halted/50 bg-halted/10 space-y-2">
          <p className="font-semibold text-halted">Withdrawals are paused</p>
          <p className="text-sm">
            This protocol is halted after a confirmed exploit report. You can still{" "}
            <strong>deposit</strong> (adding money is not frozen), but you cannot take
            money out until the governor lifts the halt.
          </p>
          <Link
            href={protocolId != null ? `/protocols/${protocolId}` : "/protocols"}
            className="text-sm text-accent hover:underline"
          >
            View protocol →
          </Link>
        </Card>
      )}

      {allowedQ.data === true && protocolQ.data?.status === "ACTIVE" && (
        <p className="text-sm text-active">Withdrawals are available.</p>
      )}

      <Card className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Your balance</p>
            <p className="text-2xl font-semibold">
              {mounted && address
                ? `${formatGen(balanceQ.data ?? BigInt(0))} GEN`
                : "Connect wallet"}
            </p>
          </div>
          <GhostButton onClick={() => void refresh()} disabled={isLocked}>
            Refresh
          </GhostButton>
        </div>

        <Field label="Amount (GEN)" hint="Example: 0.1">
          <TextInput
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.1"
            inputMode="decimal"
          />
        </Field>

        <TxStatus phase={txPhase} error={error || localError} txHash={txHash} />

        <div className="flex flex-wrap gap-3">
          <PrimaryButton
            type="button"
            onClick={onDeposit}
            disabled={!mounted || isLocked || !vaultConfigured()}
          >
            {isLocked ? "Working…" : "Deposit"}
          </PrimaryButton>
          <GhostButton
            type="button"
            onClick={onWithdraw}
            disabled={!mounted || isLocked || !vaultConfigured() || withdrawBlocked}
            className={withdrawBlocked ? "border-halted/50 text-halted" : undefined}
          >
            Withdraw
          </GhostButton>
        </div>
        {withdrawBlocked && (
          <p className="text-xs text-muted">
            The Withdraw button stays disabled until the protocol is active again.
          </p>
        )}
      </Card>
    </div>
  );
}
