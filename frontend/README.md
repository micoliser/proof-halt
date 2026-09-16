# Frontend — ProofHalt demo

Next.js App Router demo: MetaMask writes to GenLayer (studionet), reads from the
Django indexer, and fast-path syncs through a **server-side proxy** so
`SYNC_SHARED_SECRET` never ships in `NEXT_PUBLIC_*`.

## Prerequisites

- Node 20+
- Local backend from [`backend/README.md`](../backend/README.md) on `http://localhost:8000`
- MetaMask + studionet (chain id **61997**, RPC `https://studio-next.genlayer.com/api`)
- Halt Module (and optionally Demo Vault) addresses in `deploy/notes.md`

Backend `CORS_ORIGINS` must include the frontend origin (`http://localhost:3000`
locally, your Vercel URL in prod).

## Run locally

```bash
cd frontend
# Prefer Node 20 LTS on WSL (Node 24 often hits Next/SWC crashes)
# nvm use 20
cp .env.example .env.local
# fill NEXT_PUBLIC_HALT_MODULE_ADDRESS (+ DEMO_VAULT_ADDRESS when deployed)
npm install
npm run dev
```

Open http://localhost:3000

`npm run dev` uses **webpack** (not Turbopack). On this WSL host the native
Next SWC binary can `SIGBUS` and kill the process as soon as you open a page;
webpack + `@next/swc-wasm-nodejs` is the stable local path.

### Env

| Var | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | browser | Indexer base (`http://localhost:8000`) — paths under `/api` |
| `NEXT_PUBLIC_HALT_MODULE_ADDRESS` | browser | Wallet writes + `is_action_allowed` views |
| `NEXT_PUBLIC_DEMO_VAULT_ADDRESS` | browser | Vault deposit / withdraw / balance |
| `NEXT_PUBLIC_GENLAYER_RPC_URL` | browser | Default `https://studio-next.genlayer.com/api` |
| `NEXT_PUBLIC_CHAIN_ID` | browser | `61997` |
| `API_URL` | **server** | Optional override for the sync proxy (defaults to `NEXT_PUBLIC_API_URL`) |
| `SYNC_SHARED_SECRET` | **server** | Sent as `X-Sync-Secret` on `POST /api/sync/*` |

Never put the sync secret in `NEXT_PUBLIC_*`.

## How it talks to the backend

- **Reads:** browser → `{NEXT_PUBLIC_API_URL}/api/protocols`, `/cases`, `/health`
- **After wallet writes:** wait for studionet receipt (fail-closed poll, ~4 min max) →
  browser `POST /api/sync/protocols/{id}` (same-origin Next route) → Next server
  forwards to Django with `X-Sync-Secret` → UI uses the sync payload / GET detail
- **Vault gate:** `is_action_allowed` and vault balances are **on-chain views**, not
  indexer fields (`is_action_allowed` is not on the REST API)

## Scripts

```bash
npm run typecheck
npm run build
# If `next build` SIGBUS on WSL (native `@next/swc-linux-x64-gnu`), typecheck is still valid;
# retry on Vercel or a non-WSL Node 20 host: `npx next build --webpack`
npm run start
```

## Vercel

1. Root directory: `frontend`
2. Build: `npm run build`
3. Set the env vars above (including **server** `SYNC_SHARED_SECRET` and `API_URL`
   pointing at the deployed indexer)
4. Add the Vercel origin to backend `CORS_ORIGINS`

Do not deploy until contract addresses are recorded in `deploy/notes.md`.

## Cold-path click-through

Exact values and Studio steps: [`docs/demo_script.md`](../docs/demo_script.md).
