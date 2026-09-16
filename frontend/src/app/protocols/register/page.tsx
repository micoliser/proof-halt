"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAccount } from "wagmi";
import { TxStatus } from "@/components/TxStatus";
import {
  Card,
  Field,
  PrimaryButton,
  TextArea,
  TextInput,
} from "@/components/ui";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useTransaction } from "@/hooks/useTransaction";
import { syncProtocol } from "@/lib/api";
import { contractsConfigured, publicEnv } from "@/lib/env";
import {
  csvToList,
  isEthAddress,
  parseGen,
  trustedHostError,
} from "@/lib/format";
import { WRITE_METHODS } from "@/lib/genlayer/client";

type FormState = {
  name: string;
  exploit_definition: string;
  trusted_domains: string;
  protected_actions: string;
  allowed_while_halted: string;
  reporter_bond_gen: string;
  min_evidence: string;
  appeal_window_seconds: string;
};

const EMPTY: FormState = {
  name: "",
  exploit_definition: "",
  trusted_domains: "",
  protected_actions: "",
  allowed_while_halted: "",
  reporter_bond_gen: "",
  min_evidence: "",
  appeal_window_seconds: "",
};

export default function RegisterProtocolPage() {
  const router = useRouter();
  const mounted = useHasMounted();
  const { address, isConnected } = useAccount();
  const { execute, txPhase, isLocked, error, txHash } = useTransaction();
  const [form, setForm] = useState(EMPTY);
  const [backups, setBackups] = useState(["", "", ""]);
  const [localError, setLocalError] = useState<string | null>(null);

  const set =
    (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!contractsConfigured()) {
      setLocalError(
        "Contracts are not configured yet. Try again after deployment.",
      );
      return;
    }
    if (!isConnected) {
      setLocalError("Connect wallet first.");
      return;
    }

    const domains = csvToList(form.trusted_domains);
    const protectedActions = csvToList(form.protected_actions);
    const allowed = csvToList(form.allowed_while_halted);
    if (!form.name.trim() || !form.exploit_definition.trim()) {
      setLocalError("Name and safety rule are required.");
      return;
    }
    if (domains.length === 0 || protectedActions.length === 0) {
      setLocalError(
        "Add at least one trusted website and one action to freeze.",
      );
      return;
    }
    if (domains.length > 20) {
      setLocalError("At most 20 trusted websites are allowed.");
      return;
    }
    if (protectedActions.length > 20) {
      setLocalError("At most 20 actions to freeze are allowed.");
      return;
    }
    const longAction = protectedActions.find((a) => a.length > 64);
    if (longAction) {
      setLocalError(`Action "${longAction}" is too long (max 64 chars).`);
      return;
    }
    if (allowed.length > 20) {
      setLocalError("At most 20 exceptions while halted are allowed.");
      return;
    }
    const longAllowed = allowed.find((a) => a.length > 64);
    if (longAllowed) {
      setLocalError(`Exception "${longAllowed}" is too long (max 64 chars).`);
      return;
    }
    const overlap = allowed.find((a) => protectedActions.includes(a));
    if (overlap) {
      setLocalError(
        `Action "${overlap}" cannot be both protected and allowed while halted.`,
      );
      return;
    }
    for (const domain of domains) {
      const hostErr = trustedHostError(domain);
      if (hostErr) {
        setLocalError(`${hostErr} Check: ${domain}`);
        return;
      }
    }

    let bond: bigint;
    try {
      bond = parseGen(form.reporter_bond_gen);
    } catch {
      setLocalError("Report bond must be a GEN amount, for example 1");
      return;
    }
    if (bond < BigInt(1)) {
      setLocalError("Report bond must be greater than zero.");
      return;
    }
    if (bond > BigInt("1000000000000000000000000")) {
      setLocalError("Report bond must be at most 1,000,000 GEN.");
      return;
    }

    const minEvidence = Number(form.min_evidence || "1");
    const appeal = Number(form.appeal_window_seconds || "86400");
    if (!Number.isInteger(minEvidence) || minEvidence < 1 || minEvidence > 10) {
      setLocalError("Minimum evidence links must be between 1 and 10.");
      return;
    }

    const backupAddresses = backups.map((addr) => addr.trim()).filter(Boolean);
    if (backupAddresses.length > 3) {
      setLocalError("At most three backup unhalters.");
      return;
    }
    const invalidBackup = backupAddresses.find((addr) => !isEthAddress(addr));
    if (invalidBackup) {
      setLocalError(`Backup must be a 0x address: ${invalidBackup}`);
      return;
    }
    if (
      address &&
      backupAddresses.some(
        (addr) => addr.toLowerCase() === address.toLowerCase(),
      )
    ) {
      setLocalError(
        "You are already the owner; you cannot add yourself as a backup unhalter.",
      );
      return;
    }

    const args = [
      form.name.trim(),
      form.exploit_definition.trim(),
      JSON.stringify(domains),
      JSON.stringify(protectedActions),
      JSON.stringify(allowed),
      bond,
      minEvidence,
      Number.isFinite(appeal) ? appeal : 86400,
      JSON.stringify(backupAddresses),
    ];

    await execute(
      publicEnv.haltModuleAddress,
      WRITE_METHODS.registerProtocol,
      args,
      {
        confirmingMessage: "Confirm registration in wallet…",
        submittedMessage: "Registration submitted…",
        confirmedMessage: "Protocol registered and active.",
        syncAll: true,
        onConfirmed: async ({ returnedId }) => {
          // Prefer the receipt id only — never infer count-1 under concurrency.
          if (returnedId == null) {
            toast.message(
              "Protocol registered. Open Protocols to find it — the receipt did not return an id.",
            );
            router.push("/protocols");
            return;
          }
          try {
            await syncProtocol(returnedId);
          } catch {
            /* ignore */
          }
          router.push(`/protocols/${returnedId}`);
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Register a protocol</h1>
        <p className="text-sm text-muted">
          You become the owner. Anyone can later post a bonded exploit report;
          if validators agree, protected actions pause until you or a named
          backup lift the halt. This does not deploy a vault, see the{" "}
          <Link
            href="/guide"
            className="text-accent underline-offset-2 hover:underline"
          >
            developer guide
          </Link>{" "}
          to wire a contract to the new protocol id.
        </p>
      </div>

      <Card>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="Name">
            <TextInput
              value={form.name}
              onChange={set("name")}
              placeholder="Demo Vault Protocol"
              maxLength={100}
              required
            />
          </Field>
          <Field
            label="What counts as an exploit?"
            hint="Plain language for validators reviewing evidence pages."
          >
            <TextArea
              value={form.exploit_definition}
              onChange={set("exploit_definition")}
              placeholder="Halt if the evidence page states that an active exploit or ongoing drain of user funds is currently occurring…"
              maxLength={5000}
              required
            />
          </Field>
          <Field
            label="Trusted websites"
            hint="Comma-separated hosts. Evidence links must come from these sites (example: gist.github.com)."
          >
            <TextInput
              value={form.trusted_domains}
              onChange={set("trusted_domains")}
              placeholder="example.com"
              required
            />
          </Field>
          <Field
            label="Actions to freeze when halted"
            hint="For the Demo Vault, include withdraw. Example: withdraw, transfer"
          >
            <TextInput
              value={form.protected_actions}
              onChange={set("protected_actions")}
              placeholder="withdraw, transfer"
              required
            />
          </Field>
          <Field
            label="Exceptions while halted (optional)"
            hint="Leave blank for a full freeze of the actions above."
          >
            <TextInput
              value={form.allowed_while_halted}
              onChange={set("allowed_while_halted")}
              placeholder="Leave empty for none"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Stake B (GEN)"
              hint="Same amount for report, challenge, and unhalt."
            >
              <TextInput
                value={form.reporter_bond_gen}
                onChange={set("reporter_bond_gen")}
                placeholder="1"
                inputMode="decimal"
                required
              />
            </Field>
            <Field label="Min. evidence links">
              <TextInput
                value={form.min_evidence}
                onChange={set("min_evidence")}
                placeholder="1"
                inputMode="numeric"
              />
            </Field>
            <Field label="Appeal window (seconds)">
              <TextInput
                value={form.appeal_window_seconds}
                onChange={set("appeal_window_seconds")}
                placeholder="86400"
                inputMode="numeric"
              />
            </Field>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink">
              Backup unhalters (optional)
            </p>
            <p className="text-xs text-muted">
              Up to three extra wallets that can lift a halt with the same stake
              B and the same remediation bar. They cannot change policy.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {backups.map((value, index) => (
                <TextInput
                  key={index}
                  value={value}
                  onChange={(e) =>
                    setBackups((prev) =>
                      prev.map((addr, i) =>
                        i === index ? e.target.value : addr,
                      ),
                    )
                  }
                  placeholder={`0x… backup ${index + 1}`}
                  spellCheck={false}
                />
              ))}
            </div>
          </div>

          <TxStatus
            phase={txPhase}
            error={error || localError}
            txHash={txHash}
          />

          <PrimaryButton
            type="submit"
            disabled={!mounted || isLocked || !contractsConfigured()}
          >
            {isLocked ? "Working…" : "Register"}
          </PrimaryButton>
        </form>
      </Card>
    </div>
  );
}
