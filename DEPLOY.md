# Deploy `fantastic-farm` (Vite + React)

This repo is the **web client** only. Backend API is deployed separately (e.g. Render).

## Prerequisites

- **Node 20+** (match `.nvmrc` if present).
- **GitHub Packages:** dependency `@fantastic-farm/shared` resolves to `@tuanle0909/fantastic-farm-shared`. For CI you need a PAT with `read:packages` (see below).

## Local

```bash
cp .env.example .env
# fill VITE_* and optional NODE_AUTH_TOKEN for npm install
npm install
npm run dev
```

## Environment variables (`VITE_*`)

Vite inlines these **at build time**. Set them in **Vercel / Netlify / CI** before `npm run build`.

| Variable | Purpose |
|----------|---------|
| `VITE_BE_API_URL` | Backend base, e.g. `https://your-api.onrender.com/api` |
| `VITE_REQUIRED_SUI_CHAIN` | e.g. `sui:testnet` |
| `VITE_SUI_NETWORK` | e.g. `testnet` |
| `VITE_SUI_RPC_URL` | Fullnode URL |
| `VITE_FANTASTIC_FARM_*` | Same object IDs as backend / Move publish |
| `VITE_UNITY_BUILD_BASE_URL` | Unity WebGL base URL (see Unity hosting below) |

Never commit real `.env` — use host dashboard secrets.

## GitHub Packages on CI (Netlify / Vercel / GitHub Actions)

Create `.npmrc` before `npm ci` (already committed scope); add token:

```bash
bash scripts/ci-install-build.sh
```

Or manually:

```bash
echo "//npm.pkg.github.com/:_authToken:${NODE_AUTH_TOKEN}" >> .npmrc
npm ci && npm run build
```

Set secret **`NODE_AUTH_TOKEN`** = GitHub PAT with **`read:packages`**.

## Vercel

Chi tiết từng bước: **[DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md)**.

Tóm tắt: import repo → branch **`production`** (tuỳ team) → thêm **`NODE_AUTH_TOKEN`** + toàn bộ **`VITE_*`** → Deploy.

[`vercel.json`](./vercel.json) sets `installCommand` / `buildCommand`, output **`dist`**, SPA rewrites.

## Netlify

1. New site from Git → build `npm run build`, publish **`dist`**.
2. Same env vars as above; add **`NODE_AUTH_TOKEN`** in Build env vars if needed for `npm ci`.

[`netlify.toml`](./netlify.toml) configures publish folder and SPA fallback.

## Unity WebGL

`VITE_UNITY_BUILD_BASE_URL` must point to where **`o.loader.js` / `o.data` / `o.framework.js` / `o.wasm`** are hosted (same-origin or CORS-enabled CDN). Options: Netlify/Vercel **`public/unity`** copy of build output, or separate static host.

## CORS

Backend **`CORS_ALLOWED_ORIGINS`** must include your frontend origin (e.g. `https://fantastic-farm.vercel.app`).
