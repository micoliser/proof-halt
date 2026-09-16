# Security notes — ProofHalt

This is a Studionet hackathon demo, not a production incident-response product. The notes below match what the contracts actually do.

## Prompt injection

Definition, allegation, statement, and fetched evidence are wrapped in tagged blocks and labeled untrusted. Angle brackets are escaped before they enter `exec_prompt`. Model output must be JSON with a required decision field; anything else reverts (fail-closed). This reduces instruction-following from the page; it does not make the LLM immune to a page that *looks like* a real exploit.

## Trusted domains

Hosts are lowercased. Scheme, path, query, fragment, userinfo (`user@host`), port, and a leading `www.` are stripped before allowlist match (same GenLayer-safe algorithm as Multi-Source-Consensus-Oracle). Evidence URLs must be `http://` or `https://` and the normalized host must equal a registered domain. Evidence URL lists must be **distinct** after normalizing scheme + host + path (query/fragment ignored; trailing slashes collapsed) — duplicates cannot pad `min_evidence`. The same gate applies to report, challenge, and unhalt evidence. Direct tests cover the `https://trusted@evil.example` trick and duplicate-URL rejection. The UI also rejects non-allowlisted hosts before MetaMask opens.

Trusted domains must be **ASCII DNS names** (punycode `xn--…` for IDN). **IPv4/IPv6 literals are rejected** at register. Non-ASCII code points are rejected (homoglyphs cannot be registered as Unicode).

### Redirects

Allowlist checks apply to the **submitted** URL only. `gl.nondet.web.render(url, mode="text")` returns page body text and does **not** expose a final post-redirect URL for a second host check. An allowlisted host that HTTP-redirects to a non-allowlisted origin can therefore contribute page content that was never re-validated against the trusted-domain list. Mitigate by only allowlisting origins you control (or that do not open redirects). Contract fetch loops document this limitation next to each `web.render` call.

## Input caps

Names, definitions, allegations, statements, domains, URLs, action strings, and list counts are bounded on-chain (`DEFINITION_MAX`, `ALLEGATION_MAX`, `MAX_EVIDENCE_URLS`, page limit 50, and similar constants in `contracts/halt_module.py`). `is_action_allowed` / `is_protected_action` also reject action strings longer than `ACTION_MAX` (64).

LLM verdict parsing takes the **first balanced `{...}` object** (string-aware), not a greedy `\{.*\}` regex, and rejects leftover second JSON values.

## Indexer address binding

If `HALT_MODULE_ADDRESS` changes after a prior sync, the indexer **wipes** Protocol/Case/CaseEvent rows before continuing so mirrors from two contracts never mix. `GET /api/health` reports `chain.address_match` without exposing RPC URLs or DB exception text.

## Bonds (full story)

`report_exploit`, `challenge_halt`, and `request_unhalt` are payable. Attached value must equal `reporter_bond` (`B`) exactly. Wrong amount reverts; no partial credit.

| Outcome | What happens to stake |
|---|---|
| Report rejected | Reporter `B` → governor |
| Halt accepted, appeal window > 0 | Reporter `B` **escrowed** in the module |
| Halt accepted, window = 0 | Reporter `B` refunded immediately; challenges disabled |
| Challenge `false_alarm` | Escrow → challenger; challenger `B` refunded |
| Challenge `remediated` | Challenger `B` → reporter; escrow → reporter; case `CLEARED` |
| Challenge `still_active` | Challenger `B` → reporter; stay HALTED |
| Unhalt success | Unhalt `B` → reporter; escrow → reporter; case `CLEARED` |
| Unhalt fail (`remediated=false`) | Unhalt `B` **burned** (zero-address transfer); stay HALTED; event recorded |
| `finalize_appeal` after window | Escrow → reporter; **does not** unhalt |

Challenge consensus returns `false_alarm` | `remediated` | `still_active` (not a bare bool). Patch/remediation notes must not be treated as a false alarm. Governor and backup unhalters **cannot** call `challenge_halt` — they must use `request_unhalt`.

## Appeal window

`halted_at` is recorded on accepted halt using **GenVM wall-clock UTC** (`datetime.now(timezone.utc)` in `_tx_timestamp`). This codebase does not use a GenLayer consensus/block timestamp API (none is wired in the current SDK usage). Challenges require `now < halted_at + appeal_window_seconds` where `now` is also GenVM wall-clock at challenge time. **Client/browser clocks cannot bypass this** — enforcement runs inside the GenVM on-chain, not in the frontend. Window expiry alone never flips the protocol to ACTIVE.

## Case events / audit

Every settled evaluation appends an immutable `CaseEvent` (actor, statement, evidence URLs, consensus payload, status transition, bond disposition). Report-round `verdict_*` on the case head is **not** overwritten by challenge/unhalt text. There is no contract or API path that rewrites old events.

## Nondet isolation

Evidence fetch and LLM calls are encapsulated in an inner `leader_fn` and executed via `gl.eq_principle.strict_eq(leader_fn)`. Protocol status and `emit_transfer` (refund, slash, burn) run **after** consensus returns. Locals are copied out of storage before the nondet block.

## Fail-closed LLM garbage

| Path | Missing / invalid decision | Effect |
|---|---|---|
| Report | no boolean `exploit` | Revert; stay ACTIVE |
| Challenge | no valid `outcome` | Revert; stay HALTED; no slash |
| Unhalt | garbage before a decision | Revert; no burn |
| Unhalt | clear `remediated=false` | Commit; burn `B`; stay HALTED; event |

## Unhalt authorities

`request_unhalt` requires `msg.sender` ∈ {governor} ∪ backup unhalters (0–3 set at register). Backups cannot register protocols or edit policy (there is no `update_protocol`). Those same addresses are blocked from `challenge_halt`.

## Burn path

Failed unhalt calls `_burn(B)` → `_Recipient(0x000…000).emit_transfer(value=B)`. Disposition recorded as `BURNED`. If Studionet ever rejected zero-address transfers, the fallback would be permanent lock-in-module with the same honesty in docs — current code uses the zero-address path and direct tests cover fail-burn.

## Pagination

Contract views and the Django API cap `limit` at 50 (`MAX_PAGE_LIMIT` / `API_MAX_PAGE_SIZE`).

## Rate limits

The indexer throttles and retries GenLayer RPC (`-32006` / 429). Beat polls every `SYNC_POLL_INTERVAL_SECONDS` (default 300). The UI reads lists from the indexer; post-tx sync is a deliberate fast-path. Sync POSTs can be gated with `X-Sync-Secret`.

## Secrets

`.env` and `.env.local` are gitignored. Use `.env.example` files. Rotate `DJANGO_SECRET_KEY` and `SYNC_SHARED_SECRET` if they ever land in git or a screenshot. Contract addresses are public. Sync POSTs accept the secret via the `X-Sync-Secret` **header only** (query-string secrets are rejected).

## Redis / Celery broker

Redis must **not** be reachable from the public internet. Local `REDIS_URL=redis://localhost:6379/0` is fine for development. In production use AUTH (and TLS where available), e.g. `redis://:password@host:6379/0` or `rediss://:password@host:6379/0`. Apply the same to `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` when overridden.

## Adversarial review (v1.1)

| Question | Answer |
|---|---|
| Halt with one fake page on an allowlisted domain? | Yes, if `min_evidence` is 1 and the definition is loose. Mitigate with a stricter definition, higher `min_evidence`, and the reporter bond. Third parties can challenge false alarms. |
| Governor challenges with a “we patched it” page to steal reporter escrow? | Blocked: authorities cannot call `challenge_halt`; a `remediated` challenge outcome pays the reporter instead of the challenger. |
| Challenge with “we will patch later” overturns? | Prompt + classification: future patch plans → `still_active` or `remediated`, not `false_alarm`. Direct tests cover false-alarm vs remediated bond paths. |
| Bypass appeal window with a skewed client clock? | No. Window is enforced in the GenVM from `halted_at` (GenVM wall-clock), not the browser. |
| Expand trusted domains mid-halt? | No. Policy is immutable; there is no update method. |
| Rewrite old timeline events via API? | No. Events are append-only on-chain; indexer upserts by id without mutating historical payloads. |
| `finalize_appeal` early / as unhalt? | Reverts if window still open; never sets ACTIVE. |
| Register `attacker.com` and self-halt? | Yes. That is the governor’s protocol. Other protocols are unaffected. |
| Partial fetch outages → false halt? | No. Fetch count must be ≥ `min_evidence`, then a strict majority of **successfully fetched** pages must vote yes. Too few fetches → revert. |
| UI hammers Studionet into 429? | Writes go through the wallet. Reads go through the indexer. Beat is 5 minutes by default. RPC client retries rate limits. |
| Direct tests hide Address bugs? | Direct tests mock nondet. Live Studionet + Demo Vault were used for Address / payable paths. |
