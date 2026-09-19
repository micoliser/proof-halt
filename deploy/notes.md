# Deploy notes — ProofHalt

## Network: Studionet only

| Setting | Value |
|---|---|
| GenLayer RPC | `https://studio-next.genlayer.com/api` |
| Chain ID | `61997` |
| Currency | GEN |
| Explorer | https://explorer-studio-dev.genlayer.com |
| Studio | https://studio-dev.genlayer.com/run-debug |

**Faucet:** Studionet does not auto-fund CLI/gltest keys. Use the Studio UI 💧 faucet for payable/bond flows. Zero-value writes and all reads need no funding.

**Localnet:** Not used. Docker/WSL localnet is out of scope for this project.

## Contract addresses (this demo)

| Contract | Address | Notes |
|---|---|---|
| Halt Module | `0x5B53eBe29f90c1DcC634E5a80256f3Fe1FF12812` | Deploy first |
| Demo Vault | `0xd97e0FA033199DAf6f44725aa75Fc02c13314362` | Ctor: Halt Module + protocol id (this vault uses `0`) |

## Deploy order

1. Deploy `contracts/halt_module.py` (fail-closed halt gate).
2. As governor, `register_protocol(...)` with `protected_actions` including `"withdraw"`, `allowed_while_halted` as `[]`, and `backup_unhalters_json` (0–3 addresses for path B).
3. Note the returned **protocol_id** (first register → `0`).
4. Deploy `contracts/demo_vault.py` with constructor args `(halt_module_address, protocol_id)`.
5. Smoke: deposit → withdraw (ACTIVE) → `report_exploit` → withdraw fails → challenge **or** unhalt → withdraw works.
6. Update backend + frontend env vars; wipe indexer DB if replacing a prior Halt Module address.
7. Run indexer sync / health check.

### Studio register args (vault demo)

| Arg | Example |
|---|---|
| `name` | `Demo Vault Protocol` |
| `exploit_definition` | `Halt if the evidence page states that an active exploit or ongoing drain of user funds is currently occurring against this protocol…` |
| `trusted_domains_json` | `["rentry.co"]` (must match evidence URL host) |
| `protected_actions_json` | `["withdraw","transfer"]` |
| `allowed_while_halted_json` | `[]` |
| `reporter_bond` | `5000000000000000000` (5 GEN in wei) — this is stake `B` for report, challenge, and unhalt |
| `min_evidence` | `1` |
| `appeal_window_seconds` | `600` (demo) or `86400` |
| `backup_unhalters_json` | `["0x…"]` (0–3; optional but needed for backup unhalt demo) |

Vault ctor: paste the Halt Module address + `0` (or the protocol id you registered).

Cold-path steps: [docs/demo_script.md](../docs/demo_script.md). Video outline: [docs/demo_video_outline.md](../docs/demo_video_outline.md).
## Hosting (later phases)

| Service | Host | URL |
|---|---|---|
| Frontend | Vercel | _TBD_ |
| Backend | Render (or equiv.) | _TBD_ |
| Postgres | Supabase/Neon | _TBD_ |
| Redis | Upstash (or equiv.) | _TBD_ |

## Backend indexer (Phase 4)

Root directory `backend`, build `pip install -r backend/requirements.txt`.
Three process types — **all three**, or nothing polls the chain (see
`backend/Procfile`):

| Process | Command |
|---|---|
| web | `python manage.py migrate --noinput && gunicorn config.wsgi:application --bind 0.0.0.0:$PORT` |
| worker | `celery -A config worker -l info --concurrency=2` |
| beat | `celery -A config beat -l info` |

### Backend env vars

| Var | Example / default | Notes |
|---|---|---|
| `DJANGO_SECRET_KEY` | _random 50+ chars_ | Required |
| `DEBUG` | `False` | |
| `ALLOWED_HOSTS` | `api.example.com` | Comma-separated |
| `CORS_ORIGINS` | `https://your-app.vercel.app` | Frontend origins |
| `DATABASE_URL` | `postgres://…` | Supabase/Neon; add `DB_SSL_REQUIRE=True` |
| `REDIS_URL` | `rediss://…` | Upstash; also used as Celery broker/backend |
| `GENLAYER_RPC_URL` | `https://studio-next.genlayer.com/api` | Studionet only |
| `GENLAYER_CHAIN_ID` | `61997` | |
| `HALT_MODULE_ADDRESS` | _halt module address above_ | Required for any sync |
| `DEMO_VAULT_ADDRESS` | _vault address above_ | Reported by `/api/health` |
| `GENLAYER_READER_ADDRESS` | `0x1111…1111` | `from` on read-only `gen_call`; needs no funds |
| `GENLAYER_RPC_THROTTLE_SECONDS` | `0.25` | Rate-limit shield (`-32006` / 429) |
| `SYNC_SHARED_SECRET` | _random_ | Required header `X-Sync-Secret` on `POST /api/sync/*` |
| `SYNC_POLL_INTERVAL_SECONDS` | `300` | Beat cadence (5 minutes; keeps GenLayer RPC usage low) |
| `API_MAX_PAGE_SIZE` | `50` | Must match contract `MAX_PAGE_LIMIT` |

### Post-deploy seed + check

```bash
curl -X POST -H "X-Sync-Secret: $SYNC_SHARED_SECRET" https://<api-host>/api/sync/all
curl https://<api-host>/api/health
```

`/api/health` echoes the configured addresses and the sync cursor
(`last_success_at`, `last_error`) — that is the quickest way to confirm the
worker + beat pair is actually alive in the deploy.

## Frontend demo (Phase 5)

Root directory `frontend`. Local: `npm install && npm run dev` (see
`frontend/README.md`). Vercel: same root, build `npm run build`.

Wallet writes go to GenLayer; list/detail reads hit the indexer. After a
write, the UI waits for a receipt then `POST`s the Next.js proxy
`/api/sync/protocols/:id`, which forwards to Django with **server-side**
`X-Sync-Secret`. Vault withdraw gating uses on-chain
`is_action_allowed` (not an API field).

### Frontend env vars

| Var | Example / default | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` or `https://<api-host>` | Browser reads (`/api/...`) |
| `NEXT_PUBLIC_HALT_MODULE_ADDRESS` | halt module above | Required for writes |
| `NEXT_PUBLIC_DEMO_VAULT_ADDRESS` | vault above | Vault page |
| `NEXT_PUBLIC_GENLAYER_RPC_URL` | `https://studio-next.genlayer.com/api` | Studionet only |
| `NEXT_PUBLIC_CHAIN_ID` | `61997` | |
| `API_URL` | same as API URL | **Server-only** sync proxy target (defaults to `NEXT_PUBLIC_API_URL`) |
| `SYNC_SHARED_SECRET` | same as backend | **Server-only** — never `NEXT_PUBLIC_*` |

CORS: backend `CORS_ORIGINS` must include `http://localhost:3000` and the
Vercel origin. Do not deploy the frontend until both contract addresses
are filled in the table above.
