# Demo script — ProofHalt (v1.1)

Studionet only: chain id **61997**, RPC `https://studio-next.genlayer.com/api`,
Studio `https://studio-dev.genlayer.com/run-debug`, faucet 💧 in the Studio UI.

Contract addresses: [`deploy/notes.md`](../deploy/notes.md). Put them in
`frontend/.env.local` and `backend/.env`.

**Evidence URLs must be public.** Validators cannot fetch `localhost`. Use
[rentry.co](https://rentry.co) (and keep `trusted_domains` = `rentry.co`).

Unified stake: every bonded call sends **exactly** `B` (the reporter bond).

---

## 0. One-time setup

1. Start Postgres + Redis, then the indexer (`backend/README.md`):
   `migrate`, `runserver 127.0.0.1:8000`, Celery worker + beat
   (`SYNC_POLL_INTERVAL_SECONDS` defaults to 300; post-tx UI sync is immediate).
2. `cd frontend && cp .env.example .env.local` and set:
   - `NEXT_PUBLIC_API_URL=http://localhost:8000`
   - `NEXT_PUBLIC_HALT_MODULE_ADDRESS` / `NEXT_PUBLIC_DEMO_VAULT_ADDRESS`
   - `NEXT_PUBLIC_CHAIN_ID=61997`
   - Server: `SYNC_SHARED_SECRET` if the backend has one (never `NEXT_PUBLIC_*`)
3. `npm install && npm run dev` → http://localhost:3000
4. MetaMask: Connect on the demo, then **Switch to studionet**. Fund GEN from Studio 💧
   (need enough for bonds + vault deposits on every path).
5. Confirm `GET http://localhost:8000/api/health` is `ok` and shows the addresses above.

### Studio / UI values (copy-paste)

| Field | Value |
|---|---|
| Protocol name | `Demo Vault Protocol` |
| Exploit definition | `Halt if the evidence page states that an active exploit or ongoing drain of user funds is currently occurring against this protocol. Treat a clear written incident advisory as sufficient; do not require independent third-party verification or on-chain transaction corroboration for this demo protocol.` |
| Trusted domains | `rentry.co` |
| Protected actions | `withdraw, transfer` |
| Allowed while halted | _(empty)_ |
| Reporter bond `B` | `5` GEN (or `1` GEN if you prefer smaller demos) |
| Min evidence | `1` |
| Appeal window | `600` seconds (10 min) for a live challenge demo; `86400` for a long window |
| Backup unhalters | one MetaMask address you control (path B) |
| Vault deposit / withdraw | `0.1` GEN |

**Evidence (host on rentry.co, paste the public URL):**

| Purpose | Source body |
|---|---|
| Incident (true halt) | `docs/demo_evidence/incident.html` |
| Clean / false report | `docs/demo_evidence/clean.html` |
| False-alarm challenge | `docs/demo_evidence/overturn.html` (or `frontend/public/evidence/overturn.html`) |
| Remediation (unhalt) | `docs/demo_evidence/remediation.html` |

Vault ctor (Studio, after protocol `0` exists): Halt Module address + protocol id `0`.

---

## Path A — false alarm → challenge → overturn

Use the **vault’s linked protocol** (protocol `0` for the deployed Demo Vault).

1. **Connect** MetaMask on http://localhost:3000.
2. **Vault while ACTIVE:** Demo Vault → deposit `0.1` GEN → withdraw `0.1` GEN. Both confirm.
3. **Report (will be challenged as false):** Protocol detail → Report exploit.
   - Allegation: `Funds are being drained right now.`
   - Evidence: **incident** rentry (or a deliberate weak page if you want a cleaner false-alarm story — for the demo video, report with incident, then challenge with overturn wording that denies any exploit at halt time).
   - Confirm MetaMask value **exactly** `B`.
   - Read the stake / risk notice before submitting.
4. After sync: protocol **HALTED**, case `ACCEPTED_HALT`, bond escrowed, appeal countdown visible.
5. **Withdraw fails** on Demo Vault (`is_action_allowed(..., "withdraw") = false`).
6. **Challenge** from a **non-governor / non-backup** wallet (switch MetaMask account).
   - Open the active case → Challenge halt.
   - Statement: halt was a false alarm; never an active exploit.
   - Evidence: **overturn** rentry (false-alarm page — not a patch note).
   - Confirm value **exactly** `B`.
7. After consensus + sync: case `OVERTURNED`, protocol **ACTIVE**, timeline shows
   `REPORT_EVALUATED` then `CHALLENGE_EVALUATED` with `[false_alarm]` and
   `SLASH_CHALLENGER|REFUND_ACTOR`.
8. **Withdraw works** again.

**Notes**

- Owners/backups do **not** see Challenge — they must Lift halt.
- If validators classify the page as `remediated`, the protocol still goes ACTIVE but
  the challenger **pays the reporter** (`PAY_REPORTER|REFUND_REPORTER`) — that is
  intentional. Use overturn wording for Path A.

---

## Path B — halt → backup unhalt (pays reporter)

1. **Report** with the **incident** rentry as a third-party or governor wallet; value `B`.
2. Protocol **HALTED**; vault withdraw blocked; escrowed bond.
3. Switch to a **backup unhalter** wallet listed at register.
4. **Lift halt** → statement + **remediation** rentry; value **exactly** `B`.
5. After consensus: case `CLEARED`, protocol **ACTIVE**, timeline shows `UNHALT_EVALUATED`
   with `PAY_REPORTER|REFUND_REPORTER`.
6. Vault withdraw works.

**Optional fail beat:** submit unhalt with a weak/clean page. Tx still completes;
stake `B` is **burned**; protocol stays HALTED; timeline shows `BURNED`.

---

## Rejected report (optional)

Report with the **clean** rentry. Status stays **ACTIVE**; bond `B` is slashed to the
governor. UI risk notice explains this before submit.

---

## Finalize escrow (optional)

With a live halt and window closed: case page → **Release escrow**. Returns reporter
bond without unhalting. Does not set ACTIVE.

---

## Studio-only fallback

Same values against the Halt Module ABI in Studio:

1. `register_protocol(..., backup_unhalters_json)` → id `0`.
2. Deploy Demo Vault `(halt_module, 0)`.
3. Vault deposit / withdraw.
4. `report_exploit` with `value = B`.
5. `is_action_allowed(0, "withdraw")` → false.
6. Path A: `challenge_halt` from a non-authority with overturn evidence; or
   Path B: `request_unhalt` from governor/backup with remediation evidence.
7. `POST /api/sync/protocols/0` then confirm API / UI.

---

## Fail-closed UI

On validation errors (e.g. non-trusted domain), MetaMask reject, on-chain revert, or
~4 minute poll timeout, status goes to **Failed** / **Outcome unclear** (red error
styling). No infinite spinner. Use **Refresh status** on the protocol page after writes
if the list looks stale (background indexer polls every 5 minutes).
