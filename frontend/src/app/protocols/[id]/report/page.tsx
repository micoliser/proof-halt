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
import { csvToList, evidenceUrlsError } from "@/lib/format";
import { WRITE_METHODS } from "@/lib/genlayer/client";

export default function ReportExploitPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const qc = useQueryClient();
  const mounted = useHasMounted();
  const { isConnected } = useAccount();
  const { execute, txPhase, isLocked, error, txHash } = useTransaction();
  const protocolQ = useQuery({
    queryKey: ["protocol", id],
    queryFn: () => getProtocol(id),
    enabled: Number.isInteger(id) && id >= 0,
  });

  const [allegation, setAllegation] = useState("");
  const [urls, setUrls] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const p = protocolQ.data;

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
    if (p.status !== "ACTIVE") {
      setLocalError("Reports are only accepted while the protocol is active.");
      return;
    }
    const evidence = csvToList(urls.replace(/\n/g, ","));
    if (!allegation.trim() || evidence.length === 0) {
      setLocalError("Describe the issue and add at least one evidence link.");
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

    let bond: bigint;
    try {
      bond = BigInt(p.reporter_bond);
    } catch {
      setLocalError("Could not read the required bond amount.");
      return;
    }

    const result = await execute(
      publicEnv.haltModuleAddress,
      WRITE_METHODS.reportExploit,
      [p.id, allegation.trim(), JSON.stringify(evidence)],
      {
        value: bond,
        confirmingMessage: `Confirm in wallet — send exactly ${p.reporter_bond_gen} GEN…`,
        submittedMessage: "Report submitted. Waiting for confirmation…",
        reviewingMessage: "Validators are reviewing the evidence… this can take a minute.",
        confirmedMessage: "Report finished. Check whether the protocol halted.",
        syncProtocolId: p.id,
        onConfirmed: async ({ protocol }) => {
          if (protocol) qc.setQueryData(["protocol", p.id], protocol);
          await qc.invalidateQueries({ queryKey: ["protocol-cases", p.id] });
          router.push(`/protocols/${p.id}`);
        },
      },
    );

    if (!result) return;
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p className="text-sm">
        <Link href={`/protocols/${id}`} className="text-muted hover:text-ink">
          ← Back to protocol
        </Link>
      </p>
      <div>
        <h1 className="text-2xl font-semibold">Report an exploit</h1>
        <p className="text-sm text-muted">
          Post public evidence that an active exploit is happening. Validators
          decide. This is a bonded action — see the stake warning below before you
          submit.
        </p>
      </div>

      {protocolQ.isLoading && <p className="text-muted">Loading…</p>}
      {p && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">{p.name}</p>
            <p className="text-xs text-muted">
              Bond {p.reporter_bond_gen} GEN · trusted sites:{" "}
              {p.trusted_domains.join(", ") || "—"}
            </p>
          </div>
          <StatusBadge status={p.status} />
        </Card>
      )}

      {p && <BondRiskNotice action="report" bondGen={p.reporter_bond_gen} />}

      <Card>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="What is happening?">
            <TextArea
              value={allegation}
              onChange={(e) => setAllegation(e.target.value)}
              placeholder="Funds are being drained right now."
              maxLength={2000}
              required
            />
          </Field>
          <Field
            label="Evidence links"
            hint="Public https links on a trusted website (one per line). Localhost will not work."
          >
            <TextArea
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder={`https://${p?.trusted_domains?.[0] || "example.com"}/your-incident-page`}
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
            disabled={!mounted || isLocked || !p || p.status !== "ACTIVE"}
          >
            {isLocked ? "Working…" : `Submit report (${p?.reporter_bond_gen ?? "?"} GEN)`}
          </PrimaryButton>
        </form>
      </Card>
    </div>
  );
}
