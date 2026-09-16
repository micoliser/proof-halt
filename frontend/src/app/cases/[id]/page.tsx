"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { AppealCountdown } from "@/components/AppealCountdown";
import { BondRiskNotice } from "@/components/BondRiskNotice";
import { CaseTimeline } from "@/components/CaseTimeline";
import { StatusBadge } from "@/components/StatusBadge";
import { TxStatus } from "@/components/TxStatus";
import { Card, Field, PrimaryButton, TextArea } from "@/components/ui";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useNow } from "@/hooks/useNow";
import { useTransaction } from "@/hooks/useTransaction";
import { getCase, getProtocol } from "@/lib/api";
import { contractsConfigured, publicEnv } from "@/lib/env";
import {
  bondWei,
  csvToList,
  evidenceUrlsError,
  formatTimestamp,
  isAppealWindowOpen,
  isUnhaltAuthority,
  safeExternalUrl,
  shortAddress,
} from "@/lib/format";
import { WRITE_METHODS } from "@/lib/genlayer/client";
import { ApiError } from "@/lib/types";

export default function CaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const invalid = !Number.isInteger(id) || id < 1;
  const qc = useQueryClient();
  const mounted = useHasMounted();
  const { address, isConnected } = useAccount();
  const challengeTx = useTransaction();
  const finalizeTx = useTransaction();

  const q = useQuery({
    queryKey: ["case", id],
    queryFn: () => getCase(id),
    enabled: !invalid,
  });
  const protocolQ = useQuery({
    queryKey: ["protocol", q.data?.protocol_id],
    queryFn: () => getProtocol(q.data!.protocol_id),
    enabled: q.data != null,
  });

  const [statement, setStatement] = useState("");
  const [urls, setUrls] = useState("");
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const now = useNow(true);

  if (invalid) {
    return <p className="text-halted">Invalid incident.</p>;
  }
  if (q.isLoading) return <p className="text-muted">Loading incident…</p>;
  if (q.error) {
    const err = q.error;
    return (
      <p className="text-halted">
        {err instanceof ApiError && err.status === 404
          ? "This incident is not available yet. Refresh the protocol page and try again."
          : err instanceof Error
            ? err.message
            : "Failed to load incident."}
      </p>
    );
  }
  const c = q.data;
  if (!c) return null;

  const p = protocolQ.data;
  const halted = p ? p.status === "HALTED" || p.is_halted : c.protocol?.status === "HALTED";
  const windowOpen = now != null && isAppealWindowOpen(p?.appeal_ends_at, now);
  const windowClosed =
    now != null &&
    p?.appeal_ends_at != null &&
    !isAppealWindowOpen(p.appeal_ends_at, now);
  const isAuthority = isUnhaltAuthority(address, p);
  const canChallenge =
    halted &&
    c.status === "ACCEPTED_HALT" &&
    windowOpen &&
    Boolean(p) &&
    !isAuthority;
  const canFinalize =
    halted &&
    c.status === "ACCEPTED_HALT" &&
    windowClosed &&
    c.bond_settled === false &&
    Boolean(p);
  const canUnhalt = halted && isAuthority && Boolean(p);

  const invalidateAfterWrite = async () => {
    await qc.invalidateQueries({ queryKey: ["case", c.id] });
    await qc.invalidateQueries({ queryKey: ["protocol", c.protocol_id] });
    await qc.invalidateQueries({ queryKey: ["protocol-cases", c.protocol_id] });
  };

  const onChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    setChallengeError(null);
    if (!p) return;
    if (!contractsConfigured()) {
      setChallengeError("Contracts are not configured yet.");
      return;
    }
    if (!isConnected) {
      setChallengeError("Connect wallet first.");
      return;
    }
    if (!canChallenge) {
      setChallengeError("Challenges are only accepted while the halt window is open.");
      return;
    }
    const evidence = csvToList(urls.replace(/\n/g, ","));
    if (!statement.trim() || evidence.length === 0) {
      setChallengeError("Explain why the halt is wrong and add at least one evidence link.");
      return;
    }
    if (evidence.length < p.min_evidence) {
      setChallengeError(`Add at least ${p.min_evidence} evidence link(s).`);
      return;
    }
    const domainError = evidenceUrlsError(evidence, p.trusted_domains);
    if (domainError) {
      setChallengeError(domainError);
      return;
    }

    let value: bigint;
    try {
      value = bondWei(p.reporter_bond);
    } catch {
      setChallengeError("Could not read the required bond amount.");
      return;
    }

    await challengeTx.execute(
      publicEnv.haltModuleAddress,
      WRITE_METHODS.challengeHalt,
      [p.id, statement.trim(), JSON.stringify(evidence)],
      {
        value,
        confirmingMessage: `Confirm in wallet — send exactly ${p.reporter_bond_gen} GEN…`,
        submittedMessage: "Challenge submitted. Waiting for confirmation…",
        reviewingMessage: "Validators are reviewing the challenge… this can take a minute.",
        confirmedMessage: "Challenge finished. Check the timeline for the outcome.",
        syncProtocolId: p.id,
        onConfirmed: async ({ protocol }) => {
          if (protocol) qc.setQueryData(["protocol", p.id], protocol);
          await invalidateAfterWrite();
        },
      },
    );
  };

  const onFinalize = async () => {
    setFinalizeError(null);
    if (!p) return;
    if (!contractsConfigured()) {
      setFinalizeError("Contracts are not configured yet.");
      return;
    }
    if (!isConnected) {
      setFinalizeError("Connect wallet first.");
      return;
    }
    await finalizeTx.execute(
      publicEnv.haltModuleAddress,
      WRITE_METHODS.finalizeAppeal,
      [p.id],
      {
        confirmingMessage: "Confirm finalize in wallet…",
        submittedMessage: "Finalize submitted…",
        confirmedMessage:
          "Escrow released to the reporter. The protocol stays halted until an authority unhalts.",
        syncProtocolId: p.id,
        onConfirmed: async ({ protocol }) => {
          if (protocol) qc.setQueryData(["protocol", p.id], protocol);
          await invalidateAfterWrite();
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <p className="text-sm">
        <Link href={`/protocols/${c.protocol_id}`} className="text-muted hover:text-ink">
          ← {c.protocol?.name || "Back to protocol"}
        </Link>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Incident report</h1>
        <StatusBadge status={c.status} />
        {(p || c.protocol) && <StatusBadge status={p?.status || c.protocol.status} />}
      </div>

      <Card className="space-y-4 text-sm">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Allegation
          </h2>
          <p className="mt-1 whitespace-pre-wrap">{c.allegation}</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
          <dt className="text-muted">Reporter</dt>
          <dd>{shortAddress(c.reporter, 6)}</dd>
          <dt className="text-muted">Bond</dt>
          <dd>
            {c.bond_amount_gen} GEN
            {c.bond_settled ? " (settled)" : " (escrowed)"}
          </dd>
          <dt className="text-muted">Submitted</dt>
          <dd>{formatTimestamp(c.submitted_at)}</dd>
        </dl>
        {c.evidence_urls.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Report evidence
            </h2>
            <ul className="mt-1 space-y-1">
              {c.evidence_urls.map((url) => {
                const href = safeExternalUrl(url);
                return (
                  <li key={url}>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-xs text-accent hover:underline"
                      >
                        {url}
                      </a>
                    ) : (
                      <span className="break-all text-xs text-muted">{url}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Card>

      {halted && p && (
        <Card className="space-y-3">
          <AppealCountdown appealEndsAt={p.appeal_ends_at} />
          <div className="flex flex-wrap gap-2">
            {canUnhalt && (
              <Link
                href={`/protocols/${p.id}/unhalt`}
                className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-accent-ink"
              >
                Lift halt
              </Link>
            )}
            {canChallenge && (
              <a
                href="#challenge"
                className="rounded-sm border border-line px-4 py-2 text-sm hover:bg-bg-card"
              >
                Challenge halt
              </a>
            )}
            {isAuthority && windowOpen && c.status === "ACCEPTED_HALT" && (
              <p className="self-center text-xs text-muted">
                As owner/backup, use Lift halt — challenge is for third parties only.
              </p>
            )}
          </div>
        </Card>
      )}

      <Card className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Incident timeline
        </h2>
        <CaseTimeline events={c.events ?? []} />
      </Card>

      {canChallenge && p && (
        <Card id="challenge" className="scroll-mt-24 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Challenge this halt</h2>
            <p className="mt-1 text-sm text-muted">
              For third parties who believe the halt was a <strong>false alarm</strong>.
              Protocol owners and backups must use Lift halt instead.
            </p>
          </div>
          <BondRiskNotice action="challenge" bondGen={p.reporter_bond_gen} />
          <form className="space-y-4" onSubmit={onChallenge}>
            <Field label="Why was this halt unjustified?">
              <TextArea
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                placeholder="There was never an active exploit. Vault balances were intact at halt time."
                maxLength={2000}
                required
              />
            </Field>
            <Field
              label="Evidence links"
              hint={`Public https links on a trusted website (${p.trusted_domains.join(", ") || "this protocol’s allowlist"}).`}
            >
              <TextArea
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder={`https://${p?.trusted_domains?.[0] || "example.com"}/your-challenge-page`}
                required
              />
            </Field>
            <TxStatus
              phase={challengeTx.txPhase}
              error={challengeTx.error || challengeError}
              txHash={challengeTx.txHash}
              reviewing
            />
            <PrimaryButton
              type="submit"
              disabled={!mounted || challengeTx.isLocked}
            >
              {challengeTx.isLocked
                ? "Working…"
                : `Submit challenge (${p.reporter_bond_gen} GEN)`}
            </PrimaryButton>
          </form>
        </Card>
      )}

      {canFinalize && p && (
        <Card id="finalize" className="scroll-mt-24 space-y-3">
          <h2 className="text-lg font-semibold">Release reporter escrow</h2>
          <p className="text-sm text-muted">
            The challenge window is closed. Anyone can return the reporter’s bond.
            This does not unhalt the protocol.
          </p>
          <TxStatus
            phase={finalizeTx.txPhase}
            error={finalizeTx.error || finalizeError}
            txHash={finalizeTx.txHash}
          />
          <PrimaryButton
            type="button"
            onClick={onFinalize}
            disabled={!mounted || finalizeTx.isLocked}
          >
            {finalizeTx.isLocked ? "Working…" : "Finalize appeal"}
          </PrimaryButton>
        </Card>
      )}
    </div>
  );
}
