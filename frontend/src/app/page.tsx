"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getHealth } from "@/lib/api";
import { Card } from "@/components/ui";
import { ProofHaltLogo } from "@/components/ProofHaltLogo";
import { StatusBadge } from "@/components/StatusBadge";
import type { HealthResponse } from "@/lib/types";

const LOOP = [
  {
    title: "Register a safety config",
    body: "The owner names what counts as an exploit, which websites evidence may come from, and which actions freeze if a halt lands.",
  },
  {
    title: "Anyone can report",
    body: "A reporter posts a public evidence link and locks a bond. False alarms cost them; a confirmed exploit refunds the bond.",
  },
  {
    title: "Validators judge the pages",
    body: "GenLayer validators fetch the evidence and decide whether an active exploit is proven (not a company admin, not a silent multisig).",
  },
  {
    title: "Linked apps freeze",
    body: "If they agree, the protocol is halted. Opt-in contracts refuse protected actions (the Demo Vault blocks withdraw) until an authority proves the fix — or anyone challenges a bad halt in time.",
  },
];

const PILLARS = [
  {
    kicker: "Not a backdoor",
    title: "Public evidence, public decision",
    body: "The halt is not a privileged pause button. It turns on when independently fetched pages meet the protocol’s own definition of an exploit.",
  },
  {
    kicker: "Skin in the game",
    title: "Bonded reports",
    body: "One stake size B covers report, challenge, and unhalt. A rejected report pays the owner. A failed challenge pays the reporter. A remediation-classified challenge also pays the reporter. A failed unhalt burns B.",
  },
  {
    kicker: "Opt-in",
    title: "Your contract still has to ask",
    body: "The Halt Module does not seize other contracts. Apps that care (like the Demo Vault) check before they move user funds.",
  },
];

const ROLES = [
  {
    who: "Anyone",
    does: "Report an exploit with a bond and a public evidence URL. Challenge a suspected false alarm while the window is open (owners/backups cannot — they unhalt). Watch the incident timeline.",
  },
  {
    who: "Owner (governor)",
    does: "Register the protocol, name backup unhalters, and lift a halt only after validators accept remediation evidence.",
  },
  {
    who: "App developer",
    does: "Wire sensitive methods to is_action_allowed so a halt actually stops withdrawals or transfers.",
  },
];

const DEMO = [
  "Connect wallet and switch to Studionet.",
  "Deposit in the Demo Vault, then withdraw once while the protocol is active.",
  "File a bonded report with a public evidence page.",
  "When validators agree, withdrawals freeze. Deposits still work.",
  "The owner or a named backup posts proof the issue is fixed (or a third party challenges a false alarm). After a yes vote, withdraw works again.",
];

export default function HomePage() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-20">
      <section className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-end">
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <ProofHaltLogo href={null} size={56} />
            <div>
              <p className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                ProofHalt
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-accent">
                proof · then freeze
              </p>
            </div>
          </div>
          <h1 className="max-w-3xl text-2xl font-semibold tracking-tight text-ink/95 sm:text-3xl sm:leading-[1.15]">
            Anyone can prove an active exploit. Validators decide. The vault freezes.
          </h1>
          <p className="max-w-2xl text-base text-muted sm:text-lg">
            Autonomous protocols still need a kill switch when funds are being drained.
            ProofHalt is an opt-in safety layer: bonded public reports, on-chain AI
            judgment, and a freeze of the actions you marked as dangerous until
            an owner or backup proves the issue is fixed. Every consensus step
            lands on the incident timeline.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href="/vault"
              className="rounded-sm bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink hover:brightness-110"
            >
              Try the Demo Vault
            </Link>
            <Link
              href="/protocols"
              className="rounded-sm border border-line px-4 py-2.5 text-sm hover:bg-bg-card"
            >
              Browse protocols
            </Link>
            <Link
              href="/guide"
              className="rounded-sm px-4 py-2.5 text-sm text-muted hover:text-ink"
            >
              Wire your own app
            </Link>
          </div>
        </div>

        <Card className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Protocol status
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="ACTIVE" />
            <span className="text-muted">→</span>
            <StatusBadge status="HALTED" />
            <span className="text-muted">→</span>
            <StatusBadge status="ACTIVE" />
          </div>
          <p className="text-sm text-muted">
            Active means protected actions run as usual. Halted means opt-in apps
            refuse those actions (withdraw on the Demo Vault). The owner cannot
            unilaterally skip the unhalt vote.
          </p>
          <HealthStrip
            loading={health.isLoading}
            error={Boolean(health.error)}
            data={health.data}
          />
        </Card>
      </section>

      <section className="space-y-6">
        <div className="max-w-3xl space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">Why this exists</h2>
          <p className="text-muted">
            A pause controlled only by a team wallet is theater: users have to trust
            that someone is watching, honest, and online. When an exploit is already
            public, the network should be able to freeze the dangerous path from
            evidence, then unfreeze only when recovery is equally public.
          </p>
        </div>
        <div className="grid gap-8 border-t border-line pt-8 md:grid-cols-3 md:gap-0 md:divide-x md:divide-line">
          {PILLARS.map((item) => (
            <div key={item.title} className="md:px-8 first:md:pl-0 last:md:pr-0">
              <p className="text-xs uppercase tracking-wide text-accent">{item.kicker}</p>
              <h3 className="mt-2 font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-xl font-semibold tracking-tight">How a halt happens</h2>
        <ol className="relative space-y-0 border-l border-accent/40 pl-8">
          {LOOP.map((step, i) => (
            <li key={step.title} className="relative pb-10 last:pb-0">
              <span className="absolute -left-8 top-0 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-bg font-mono text-[11px] text-accent ring-2 ring-accent/50">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="mt-1 max-w-2xl text-sm text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">What freezes</h2>
          <p className="text-sm text-muted">
            While halted, only actions the owner listed as exceptions stay allowed.
            Unknown names are denied. The Demo Vault freezes <strong className="text-ink">withdraw</strong> and
            still accepts deposits so users are not locked out of putting funds in a
            safer place.
          </p>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-line">
                <td className="py-3 text-muted">Withdraw / transfer</td>
                <td className="py-3 text-right text-halted">Blocked while halted</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-3 text-muted">Deposit (Demo Vault)</td>
                <td className="py-3 text-right text-active">Still allowed</td>
              </tr>
              <tr>
                <td className="py-3 text-muted">Lift the halt</td>
                <td className="py-3 text-right">Owner or backup + validator yes on a fix</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Who does what</h2>
          <dl className="space-y-5">
            {ROLES.map((role) => (
              <div key={role.who} className="border-l-2 border-accent/70 pl-4">
                <dt className="font-semibold">{role.who}</dt>
                <dd className="mt-1 text-sm text-muted">{role.does}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted">
            Registering a protocol here does not deploy a new vault. This site’s Demo
            Vault is already wired to one protocol. To attach your own app, follow the{" "}
            <Link href="/guide" className="text-accent underline-offset-2 hover:underline">
              developer guide
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-sm border border-accent/30 bg-accent/5">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-4 p-6 sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight">Walk the demo</h2>
            <p className="max-w-2xl text-sm text-muted">
              You need wallet on Studionet and a little GEN from the Studio faucet.
              The loop takes a few minutes because validators read the evidence pages.
            </p>
            <ol className="max-w-2xl space-y-3 text-sm">
              {DEMO.map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="font-mono text-accent">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/vault"
                className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110"
              >
                Open Demo Vault
              </Link>
              <Link
                href="/protocols/register"
                className="rounded-sm border border-line bg-bg/40 px-4 py-2 text-sm hover:bg-bg-card"
              >
                Register a protocol
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-l-4 border-warn/70 pl-5 sm:pl-6">
        <h2 className="text-xl font-semibold tracking-tight">What this does not claim</h2>
        <p className="mt-3 max-w-3xl text-sm text-muted">
          Validators judge <strong className="text-ink">page content</strong> on websites the owner
          allowlisted. They are not verifying a cryptographic exploit proof. A weak
          definition, a captured domain, or a convincing fake page can still fool
          the model. Bonds, trusted hosts, and the unhalt vote are the brakes
          (not omniscience).
        </p>
        <p className="mt-3 max-w-3xl text-sm text-muted">
          The Halt Module is the source of truth. This website only displays it and
          helps you send transactions.
        </p>
      </section>
    </div>
  );
}

function HealthStrip({
  loading,
  error,
  data,
}: {
  loading: boolean;
  error: boolean;
  data: HealthResponse | undefined;
}) {
  return (
    <div className="border-t border-line pt-3 text-sm">
      {loading && <p className="text-muted">Checking indexer…</p>}
      {error && (
        <p className="text-halted">
          Cannot reach the app backend. Start it, then refresh.
        </p>
      )}
      {data && (
        <dl className="grid grid-cols-3 gap-3">
          <div>
            <dt className="text-xs text-muted">Indexer</dt>
            <dd className="mt-1">
              <StatusBadge status={data.status === "ok" ? "ACTIVE" : "HALTED"} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Protocols</dt>
            <dd className="mt-1 font-mono">{data.indexed?.protocols ?? "n/a"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Incidents</dt>
            <dd className="mt-1 font-mono">{data.indexed?.cases ?? "n/a"}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
