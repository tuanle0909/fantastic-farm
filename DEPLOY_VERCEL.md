# Deploy lên Vercel (`fantastic-farm`)

## 1. Import repo

1. Vào [vercel.com/new](https://vercel.com/new) → **Add GitHub** / chọn repo **`tuanle0909/fantastic-farm`**.
2. **Production Branch:** `production` (hoặc `main` nếu team dùng main làm prod).
3. **Framework Preset:** Vite (tự nhận).

Project đã khai trong [`vercel.json`](./vercel.json):

- **Install Command:** `bash scripts/vercel-install.sh` — gắn token GitHub Packages rồi `npm install`.
- **Build Command:** `npm run build`.
- **Output:** `dist` (chuẩn Vite).
- **SPA:** rewrite mọi path về `index.html`.

## 2. Environment Variables (Settings → Environment Variables)

Thêm cho **Production** (và **Preview** nếu cần):

| Key | Ghi chú |
|-----|---------|
| **`NODE_AUTH_TOKEN`** | PAT GitHub (`read:packages`) — **bắt buộc** để cài `@fantastic-farm/shared`. |
| **`VITE_BE_API_URL`** | VD `https://fantastic-farm-api.onrender.com/api` |
| **`VITE_REQUIRED_SUI_CHAIN`** | VD `sui:testnet` |
| **`VITE_SUI_NETWORK`** | VD `testnet` |
| **`VITE_SUI_RPC_URL`** | Fullnode |
| **`VITE_SLUSH_WALLET_ORIGIN`** | VD `https://slush.app` |
| **`VITE_PREFERRED_WALLET`** | VD `Slush` |
| **`VITE_UNITY_BUILD_BASE_URL`** | VD `/unity` (assets trong `public/unity`) |
| **`VITE_FANTASTIC_FARM_PACKAGE_ID`** | Cùng publish với BE |
| **`VITE_FANTASTIC_FARM_REGISTRY_OBJECT_ID`** | |
| **`VITE_FANTASTIC_FARM_MARKETPLACE_OBJECT_ID`** | |
| **`VITE_FANTASTIC_FARM_FC_MINT_REGISTRY_OBJECT_ID`** | |

Copy từ `.env` local (đừng commit `.env`). Xem [`/.env.example`](./.env.example).

## 3. Backend CORS

Trên Render (BE), **`CORS_ALLOWED_ORIGINS`** phải có URL Vercel, ví dụ:

`https://fantastic-farm-xxxxx.vercel.app` hoặc domain custom.

## 4. Deploy

**Deployments → Redeploy** sau khi đổi env. Build log phải qua bước `npm install` không lỗi 401 GPR.

## 5. Domain

Settings → Domains — gắn domain riêng nếu cần; nhớ thêm origin đó vào CORS backend.
