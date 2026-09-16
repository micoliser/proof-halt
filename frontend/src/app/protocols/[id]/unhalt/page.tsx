"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { BondRiskNotice } from "@/components/BondRiskNotice";
import { StatusBadge } from "@/components/StatusBadge";
import { TxStatus } from "@/components/TxStatus";
import { Card, Field, PrimaryButton, TextArea } from "@/components/ui";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useTransaction } from "@/hooks/useTransaction";
import { getProtocol } from "@/lib/api";
import { contractsConfigured, publicEnv } from "@/lib/env";
import { bondWei, csvToList, evidenceUrlsError, isUnhaltAuthority } from "@/lib/format";
import { WRITE_METHODS } from "@/lib/genlayer/client";

export default function UnhaltPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const qc = useQueryClient();
  const mounted = useHasMounted();
  const { address, isConnected } = useAccount();
  const { execute, txPhase, isLocked, error, txHash } = useTransaction();
  const protocolQ = useQuery({
    queryKey: ["protocol", id],
    queryFn: () => getProtocol(id),
    enabled: Number.isInteger(id) && id >= 0,
  });

  const [statement, setStatement] = useState("");
  const [urls, setUrls] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const p = protocolQ.data;
  const isAuthority = isUnhaltAuthority(address, p);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!p) return;
    if (!contractsConfigured()) {
      setLocalError("Contracts are not configured yet.");
      return;
    }
    if (!isConnected) {
      setLocalError("Connect wallet first.");
      return;
    }
    if (!isAuthority) {
      setLocalError("Only the protocol owner or a named backup can lift the halt.");
      return;
    }
    if (p.status !== "HALTED") {
      setLocalError("You can only lift the halt while the protocol is halted.");
      return;
    }
    const evidence = csvToList(urls.replace(/\n/g, ","));
    if (!statement.trim() || evidence.length === 0) {
      setLocalError("Describe the fix and add at least one evidence link.");
      return;
    }
    if (evidence.length < p.min_evidence) {
      setLocalError(`Add at least ${p.min_evidence} evidence link(s).`);
      return;
    }
    const domainError = evidenceUrlsError(evidence, p.trusted_domains);
    if (domainError) {
      setLocalError(domainError);
      return;
    }

    let value: bigint;
    try {
      value = bondWei(p.reporter_bond);
    } catch {
      setLocalError("Could not read the required bond amount.");
      return;
    }

    await execute(
      publicEnv.haltModuleAddress,
      WRITE_METHODS.requestUnhalt,
      [p.id, statement.trim(), JSON.stringify(evidence)],
      {
        value,
        confirmingMessage: `Confirm in wallet — send exactly ${p.reporter_bond_gen} GEN…`,
        submittedMessage: "Request submitted. Waiting for confirmation…",
        reviewingMessage: "Validators are reviewing the remediation evidence…",
        confirmedMessage:
          "Request finished. If validators agreed, the protocol is active; if not, stake B was burned and it stays halted.",
        syncProtocolId: p.id,
        onConfirmed: async ({ protocol }) => {
          if (protocol) qc.setQueryData(["protocol", p.id], protocol);
          await qc.invalidateQueries({ queryKey: ["protocol-cases", p.id] });
          await qc.invalidateQueries({ queryKey: ["case"] });
          router.push(`/protocols/${p.id}`);
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p className="text-sm">
        <Link href={`/protocols/${id}`} className="text-muted hover:text-ink">
          ← Back to protocol
        </Link>
      </p>
      <div>
        <h1 className="text-2xl font-semibold">Lift the halt</h1>
        <p className="text-sm text-muted">
          For the owner or a named backup after the issue is fixed. This is a bonded
          action — see the stake warning below before you submit.
        </p>
      </div>

      {p && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">{p.name}</p>
            <p className="text-xs text-muted">
              {isAuthority
                ? "You may request unhalt."
                : "Your wallet is not the owner or a backup unhalter."}
            </p>
          </div>
          <StatusBadge status={p.status} />
        </Card>
      )}

      {p && <BondRiskNotice action="unhalt" bondGen={p.reporter_bond_gen} />}

      <Card>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="What was fixed?">
            <TextArea
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="The vulnerable path has been patched. The exploit is closed."
              maxLength={2000}
              required
            />
          </Field>
          <Field
            label="Proof links"
            hint="Public links on a trusted website for this protocol."
          >
            <TextArea
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder={`https://${p?.trusted_domains?.[0] || "example.com"}/your-remediation-page`}
              required
            />
          </Field>
          <TxStatus
            phase={txPhase}
            error={error || localError}
            txHash={txHash}
            reviewing
          />
          <PrimaryButton
            type="submit"
            disabled={!mounted || isLocked || !p || p.status !== "HALTED" || !isAuthority}
          >
            {isLocked
              ? "Working…"
              : `Request to lift halt (${p?.reporter_bond_gen ?? "?"} GEN)`}
          </PrimaryButton>
        </form>
      </Card>
    </div>
  );
}
