# BCRS Real-Time Serverless Edge Proxy

A lightweight serverless edge proxy that fetches live BCRS RVM status and bin telemetry directly from `bts.bcrs.sg` with CORS enabled.

## Features
- **Zero cold starts**: Runs on Cloudflare's global edge network (Singapore edge node ~5ms from user).
- **CORS enabled**: Allows browser JavaScript on GitHub Pages (`https://eclypheon.github.io`) to query live data.
- **Smart upstream caching**:
  - `GET /` or `GET /api/rvms`: Returns all 1,429 RVMs with live operational status (cached for 30s; bypasses cache with `?refresh=true`).
  - `GET /api/rvms/:id/bin-status` (or `?rvmId=:id`): Returns real-time bin compartment telemetry and threshold levels.

---

## 1-Minute Deployment Options

### Option A: Via Wrangler CLI (Recommended)
From your terminal:
```bash
cd worker
npx wrangler deploy
```
1. If this is your first time, Wrangler will open your browser to log into your free Cloudflare account.
2. It will deploy immediately and print your live URL:
   ```
   Published bcrs-finder-proxy (1.23 sec)
     https://bcrs-finder-proxy.<your-subdomain>.workers.dev
   ```
3. Add your worker URL to `.env.local` or GitHub repository secrets / environment variables:
   ```env
   VITE_BCRS_PROXY_URL=https://bcrs-finder-proxy.<your-subdomain>.workers.dev
   ```

### Option B: Via Cloudflare Web Dashboard (No CLI needed)
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create application** → **Create Worker**.
2. Name it `bcrs-finder-proxy` and click **Deploy**.
3. Click **Edit code**, paste the contents of [`worker/index.js`](./index.js), and click **Deploy**.
4. Copy your worker URL and set `VITE_BCRS_PROXY_URL`.

### Option C: Via Vercel
We have also included [`api/rvms.js`](../api/rvms.js) and [`api/bin-status.js`](../api/bin-status.js) in the repository root.
If you import this repository into Vercel, both the frontend and the serverless API functions are deployed automatically on every git commit.
