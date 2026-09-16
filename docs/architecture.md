# ProofHalt — Architecture

## Problem

Autonomous protocols need a kill switch that is not a trusted multisig theater. When public evidence of an **active exploit** appears, protected operations should freeze through independently verified judgment.

## Solution (one loop)

1. **Governor** registers a protocol with a **Safety Config** (exploit definition, trusted domains, protected actions, unified bond `B`, `min_evidence`, appeal window, optional 0–3 backup unhalters). Policy is **immutable** after register.
2. **Anyone** submits a **bonded** `report_exploit` with evidence URLs (`value == B`).
3. GenLayer validators **fetch** those pages and run an LLM judgment.
4. Comparative consensus agrees on `exploit: bool` (summaries may differ).
5. If `exploit=true` → protocol **HALTED**; reporter bond is **escrowed** while `appeal_window > 0` (refunded immediately if window is 0). If false → stay **ACTIVE**; bond **slashed to governor**.
6. Opt-in **Demo Vault** calls `is_action_allowed(protocol_id, "withdraw")` and refuses withdraw while halted.
7. Recovery (first successful clear wins):
   - **Challenge** (third parties only; not governor/backups): validators classify `false_alarm` | `remediated` | `still_active`.
   - **Unhalt** (governor ∪ backups): validators judge `remediated`; fail **burns** `B` and stays HALTED.
8. Appeal window expiry alone does **not** auto-ACTIVE. Anyone may `finalize_appeal` afterward to release remaining reporter escrow without unhalting.

**Halt gate:** `ACTIVE` → all actions allowed. `HALTED` → fail-closed; only `allowed_while_halted` actions permitted (unknown/typos denied).

## Layers

```
Frontend (Next.js)
  wallet writes → GenLayer
  reads → Backend REST

Backend (thin Django indexer)
  poll-and-diff + fast-path sync
  never invents verdicts

GenLayer (studionet)
  halt_module.py  — registry, adjudication, bonds, case events
  demo_vault.py   — halt-aware toy vault
```

| Layer | Owns | Must never |
|---|---|---|
| Contracts | Truth, adjudication, halt, bonds, event audit | Depend on backend for decisions |
| Backend | Cached reads, sync | Override or invent halt state |
| Frontend | UX, wallet writes | Be source of truth for halt |

## State machine

```
ACTIVE ──(exploit=true)──► HALTED
                             │
    ┌──(challenge: false_alarm → OVERTURNED)──┐
    │                                         │
    ├──(challenge: remediated → CLEARED)──────┤
    │                                         │
    └──(unhalt: remediated=true → CLEARED)────┴──► ACTIVE
```

Challenge only while `now < halted_at + appeal_window`. Unhalt anytime while `HALTED`.

## Indexer API

The backend mirrors the contract's view methods and nothing else. Reads are
paginated with `offset`/`limit` (capped at the contract's page limit); u256
amounts cross the wire as decimal strings. Case detail includes an append-only
`events` timeline (oldest first).

| Route | Purpose |
|---|---|
| `GET /api/health` | DB + chain config + sync cursor freshness |
| `GET /api/protocols` · `/api/protocols/<id>` | Registry list / detail (`backup_unhalters`, `halted_at`, `appeal_ends_at`) |
| `GET /api/protocols/<id>/cases` | Cases for one protocol |
| `GET /api/cases` · `/api/cases/<id>` | Reports list / detail with verdict + events |
| `POST /api/sync/protocols/<id>` | Fast-path resync right after a wallet tx |
| `POST /api/sync/all` | Full poll-and-diff |

A Celery beat task polls count anchors every `SYNC_POLL_INTERVAL_SECONDS`
(default **300s / 5 minutes**); the fast-path POST runs the same reads inline
so a fresh halt is visible immediately after a wallet tx. Full route shapes:
[backend/README.md](../backend/README.md).

## Trust model

| On-chain (deterministic) | AI-judged (nondet) |
|---|---|
| Registration, unified `B`, escrow/settlement, status machine, appeal deadline, unhalt auth set, event append, `is_action_allowed` | Report `exploit`, challenge `outcome`, unhalt `remediated` |

**Fail-closed on LLM garbage:** missing JSON / required decision fields, or failed consensus, raises `UserError`. A bad report does not halt. A bad challenge/unhalt parse reverts with no bond movement (except a clear unhalt `remediated=false`, which burns).

**Limit:** AI judges **page content** on allowlisted domains, not cryptographic exploit proofs. Bonds, trusted domains, challenge classification, and unhalt burn are the brakes.

## Consensus

- Live evidence → `gl.nondet.web.render` + `gl.nondet.exec_prompt` wrapped in an inner `leader_fn`.
- The `leader_fn` internally extracts the JSON and returns only a strict primitive (`bool` or `str` enum). 
- Validators execute this via `gl.eq_principle.strict_eq(leader_fn)`, enforcing strict equivalence on the final extracted decision (`exploit` / `outcome` / `remediated`), which bypasses non-deterministic JSON string spacing issues.
- Aggregation (locked): majority of successfully fetched trusted-domain pages; fetch count ≥ `min_evidence`.
- Side effects (status, `emit_transfer` bond settle) happen **after** consensus.
- Case head `verdict_*` is report-round only; later rounds live in append-only `CaseEvent`s.

## Bond economics (unified `B`)

Outbound GEN uses Covenant Escrow’s pattern: `_Recipient(addr).emit_transfer(value=...)`.
Failed unhalt burns via transfer to the zero address.

| Outcome | Reporter `B` | Counterparty `B` |
|---|---|---|
| Report rejected | → governor | — |
| Halt accepted, window > 0 | escrowed | — |
| Halt accepted, window = 0 | refund reporter | — |
| Challenge `false_alarm` | escrow → challenger | refund challenger |
| Challenge `remediated` | escrow → reporter | → reporter |
| Challenge `still_active` | still escrowed | → reporter |
| Unhalt success | escrow → reporter | → reporter |
| Unhalt fail | unchanged | **burned** |
| `finalize_appeal` | escrow → reporter | — (no unhalt) |

## Differentiation (vs Latchkey-style courts)

- Three clear states, not a long posture ladder.
- Separate **Demo Vault** governed by the Halt Module (“contracts that govern contracts”).
- Bonded anyone-can-report kill-switch + bonded false-alarm challenge for the Autonomous Protocols track.
- Append-only incident timeline with bond dispositions.

## Network

**Studionet only** (RPC `https://studio.genlayer.com/api`, chain id `61997`). Localnet is out of scope for this environment.

See [README.md](../README.md), [SECURITY.md](SECURITY.md), and [demo_script.md](demo_script.md).
