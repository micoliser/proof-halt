"use client";

import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { Card } from "@/components/ui";
import { publicEnv, STUDIONET_STUDIO, contractsConfigured } from "@/lib/env";

const haltAddress = publicEnv.haltModuleAddress || "<HALT_MODULE_ADDRESS>";

const TOC = [
  { href: "#model", label: "1. Two layers" },
  { href: "#order", label: "2. Order of operations" },
  { href: "#register", label: "3. Register a protocol" },
  { href: "#contract", label: "4. Write your contract" },
  { href: "#deploy", label: "5. Deploy (Demo Vault)" },
  { href: "#operate", label: "7. Report, challenge, unhalt" },
  { href: "#mistakes", label: "8. Common mistakes" },
];

const REGISTER_EXAMPLE = JSON.stringify(
  {
    name: "Demo Vault Protocol",
    exploit_definition:
      "Halt if the evidence page states that an active exploit or ongoing drain of user funds is currently occurring.",
    trusted_domains_json: '["gist.github.com"]',
    protected_actions_json: '["withdraw", "transfer"]',
    allowed_while_halted_json: "[]",
    reporter_bond: 1000000000000000000,
    min_evidence: 1,
    appeal_window_seconds: 86400,
    backup_unhalters_json: "[]",
  },
  null,
  2,
);

const IFACE = `@gl.contract_interface
class HaltModuleIface:
    class View:
        def is_action_allowed(self, protocol_id: int, action: str) -> bool: ...

    class Write:
        pass`;

const CTOR = `class DemoVault(gl.Contract):
    halt_module: Address
    protocol_id: u256

    def __init__(self, halt_module: Address, protocol_id: int):
        # Store the Halt Module address and the protocol id you just registered.
        # This id is baked in. You cannot retarget a live vault later.
        self.halt_module = halt_module
        self.protocol_id = u256(int(protocol_id))`;

const GATE = `WITHDRAW_ACTION = "withdraw"

def _require_withdraw_allowed(self) -> None:
    halt = HaltModuleIface(self.halt_module)
    allowed = halt.view().is_action_allowed(
        int(self.protocol_id),
        WITHDRAW_ACTION,
    )
    if not allowed:
        raise gl.vm.UserError(
            "Withdraw blocked: linked Halt Module protocol is halted"
        )

@gl.public.write
def withdraw(self, amount: int) -> None:
    self._require_withdraw_allowed()
    # ... debit balance, then emit_transfer ...`;

const STUDIO_CTOR = `${haltAddress}
0`;

const GATE_RULES = `is_action_allowed(protocol_id, action)

ACTIVE  → True for every action
HALTED  → True only if action is in allowed_while_halted
          (unknown / mistyped names → False)
`;

export default function GuidePage() {
  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-accent">
          For developers
        </p>
        <nav className="flex flex-col gap-1 text-sm">
          {TOC.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-sm px-2 py-1 text-muted hover:bg-bg-card hover:text-ink"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      <div className="max-w-3xl space-y-10">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Wire an app to ProofHalt
          </h1>
          <p className="text-muted">
            If an exploit is draining user funds, you need a kill switch for the
            dangerous actions (withdraw, transfer, anything that moves value)
            without waiting on a company admin. ProofHalt’s Halt Module is that
            switch: anyone can post a bonded public report, GenLayer validators
            judge the evidence, and if they agree the exploit is real, your
            protocol is marked halted. Call{" "}
            <code className="font-mono text-sm text-ink">is_action_allowed</code>{" "}
            before those writes. Use{" "}
            <code className="font-mono text-sm text-ink">is_protected_action</code>{" "}
            (or the indexed protected list) only as a helper — the halt gate
            itself is fail-closed on <code className="font-mono text-sm text-ink">allowed_while_halted</code>.
          </p>
          <p className="text-muted">
            You need it because your contract still executes those methods unless you
            check first. Before a sensitive write, call{" "}
            <code className="font-mono text-sm text-ink">is_action_allowed</code>.
            If the protocol is halted, refuse the call.
          </p>
          <p className="text-sm text-muted">
            This Halt Module:{" "}
            {contractsConfigured() ? (
              <code className="break-all font-mono text-ink">{haltAddress}</code>
            ) : (
              <span>not configured in this environment</span>
            )}
          </p>
        </header>

        <section id="model" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold">1. Two layers</h2>
          <Card>
            <pre className="overflow-x-auto font-mono text-sm leading-relaxed text-ink">
{`Halt Module
  └── protocol id 0  ──► Demo Vault on this site (constructor locked to 0)
  └── protocol id N  ──► any contract that asks is_action_allowed(N, action)`}
            </pre>
          </Card>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
            <li>
              <strong className="text-ink">Halt Module</strong> — register, bonded
              reports, validator judgment, halt / unhalt. One module, many protocols.
            </li>
            <li>
              <strong className="text-ink">Your contract</strong> — stores{" "}
              <code className="font-mono text-ink">(halt_module, protocol_id)</code>{" "}
              and gates sensitive methods.
            </li>
          </ul>
        </section>

        <section id="order" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold">2. Order of operations</h2>
          <ol className="space-y-2 text-sm">
            <li className="flex gap-3">
              <span className="text-accent">1.</span>
              <span>
                Halt Module is already live.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent">2.</span>
              <span>
                Register a protocol. You become governor. Note
                the returned <code className="font-mono">protocol_id</code> (0, 1,
                2, …).
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent">3.</span>
              <span>
                Deploy your contract with constructor{" "}
                <code className="font-mono">(halt_module_address, protocol_id)</code>.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent">4.</span>
              <span>
                Before a sensitive write, call{" "}
                <code className="font-mono">is_action_allowed(protocol_id, action)</code>.
                The action string must match registration exactly (for example:{" "}
                <code className="font-mono">withdraw</code>).
              </span>
            </li>
          </ol>
        </section>

        <section id="register" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold">3. Register a protocol</h2>
          <p className="text-sm text-muted">
            Use{" "}
            <Link href="/protocols/register" className="text-accent underline-offset-2 hover:underline">
              Register
            </Link>{" "}
            while connected to Studionet, or call{" "}
            <code className="font-mono text-ink">register_protocol</code> in{" "}
            <a
              href={STUDIONET_STUDIO}
              className="text-accent underline-offset-2 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Studio
            </a>
            . The caller is the governor. Optional backup unhalters (0–3) can later
            request unhalt; they cannot change policy.
          </p>
          <p className="text-sm text-muted">
            For a vault like ours, include <code className="font-mono">withdraw</code>{" "}
            in protected actions and do not put it in the halt exceptions list.
          </p>
          <CodeBlock title="register_protocol — example args" code={REGISTER_EXAMPLE} />
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
            <li>
              <code className="font-mono text-ink">trusted_domains</code> — hosts
              only (example: <code className="font-mono">gist.github.com</code>). Evidence
              URLs must match.
            </li>
            <li>
              <code className="font-mono text-ink">reporter_bond</code> — wei. This is
              stake <code className="font-mono">B</code> for report, challenge, and
              unhalt. <code className="font-mono">1</code> GEN on the form is{" "}
              <code className="font-mono">10^18</code>.
            </li>
          </ul>
        </section>

        <section id="contract" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold">4. Write your contract</h2>
          <p className="text-sm text-muted">
            Pin the same GenVM runner as this repo, then declare a view-only
            interface and gate the methods you want frozen.
          </p>
          <CodeBlock
            title="contracts/demo_vault.py — Depends (first line)"
            code={`# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }`}
          />
          <CodeBlock title="Halt Module interface" code={IFACE} />
          <CodeBlock title="Constructor — lock the protocol id" code={CTOR} />
          <CodeBlock title="Gate withdraw (this repo’s Demo Vault)" code={GATE} />
          <CodeBlock title="Halt gate rules" code={GATE_RULES} />
          <p className="text-sm text-muted">
            Deposits in the Demo Vault are intentionally <em>not</em> gated. Only
            withdraw asks the Halt Module. Your app can gate any action name you
            registered.
          </p>
        </section>

        <section id="deploy" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold">5. Deploy a Demo Vault</h2>
          <ol className="space-y-2 text-sm">
            <li className="flex gap-3">
              <span className="text-accent">1.</span>
              <span>
                Register the protocol first and copy the id (first protocol is{" "}
                <code className="font-mono">0</code>, next is{" "}
                <code className="font-mono">1</code>, …).
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent">2.</span>
              <span>
                Open{" "}
                <a
                  href={STUDIONET_STUDIO}
                  className="text-accent underline-offset-2 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  studio.genlayer.com
                </a>
                , new intelligent contract, paste{" "}
                <code className="font-mono">contracts/demo_vault.py</code>.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent">3.</span>
              <span>
                Constructor args: Halt Module address, then protocol id as an
                integer. Example for protocol <code className="font-mono">0</code>:
              </span>
            </li>
          </ol>
          <CodeBlock title="Studio constructor args" code={STUDIO_CTOR} />
          <p className="text-sm text-muted">
            For a protocol you just registered as id <code className="font-mono">1</code>
            , pass <code className="font-mono">1</code> as the second argument — not{" "}
            <code className="font-mono">0</code>. Deploying another copy is how you
            attach a new protocol; you cannot update the id on an existing vault.
          </p>
          <p className="text-sm text-muted">
            Smoke: deposit → withdraw while ACTIVE → report a true exploit on that
            protocol → withdraw should revert → governor unhalt → withdraw works
            again.
          </p>
        </section>

        <section id="operate" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold">7. Report, challenge, unhalt</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
            <li>
              Evidence URLs must be <strong className="text-ink">public</strong>.
              Validators cannot fetch localhost. Use{" "}
              <code className="font-mono">gist.github.com</code> (or another host you
              listed).
            </li>
            <li>
              Send <strong className="text-ink">exactly</strong> stake{" "}
              <code className="font-mono">B</code> (the reporter bond) with{" "}
              <code className="font-mono">report_exploit</code>,{" "}
              <code className="font-mono">challenge_halt</code>, and{" "}
              <code className="font-mono">request_unhalt</code>.
            </li>
            <li>
              If validators agree there is an active exploit, the protocol goes{" "}
              <strong className="text-ink">HALTED</strong>. Linked vaults that gate{" "}
              <code className="font-mono">withdraw</code> freeze withdrawals. The
              reporter bond is escrowed through the challenge window.
            </li>
            <li>
              Anyone can <code className="font-mono">challenge_halt</code> while the
              appeal window is open — except the governor and backup unhalters, who
              must use <code className="font-mono">request_unhalt</code>. Validators
              classify the challenge as <code className="font-mono">false_alarm</code>{" "}
              (reporter escrow → challenger), <code className="font-mono">remediated</code>{" "}
              (challenger stake → reporter, same as a successful unhalt), or{" "}
              <code className="font-mono">still_active</code> (challenger stake →
              reporter; halt stands).
            </li>
            <li>
              The governor or a backup unhalter can{" "}
              <code className="font-mono">request_unhalt</code> anytime while halted.
              Success pays the reporter; a failed unhalt{" "}
              <strong className="text-ink">burns</strong> stake B and stays HALTED.
            </li>
            <li>
              Each consensus step is an append-only event on the incident timeline.
              After the window, <code className="font-mono">finalize_appeal</code>{" "}
              releases remaining escrow without unhalting.
            </li>
          </ul>
        </section>

        <section id="mistakes" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold">8. Common mistakes</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
            <li>
              Deploying the vault <em>before</em> register, or passing the wrong
              protocol id.
            </li>
            <li>
              Gating <code className="font-mono">&quot;withdraws&quot;</code> while
              you registered <code className="font-mono">&quot;withdraw&quot;</code>{" "}
              , while halted, unknown names are denied.
            </li>
            <li>
              Putting <code className="font-mono">withdraw</code> in both
              protected actions and halt exceptions, the Halt Module rejects
              overlap.
            </li>
            <li>
              Private evidence URLs, or a host not in{" "}
              <code className="font-mono">trusted_domains</code>.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
