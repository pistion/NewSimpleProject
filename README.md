# Glondia Sites

Glondia Sites is a Vite React app served by a lightweight Express server. The product focus is website building, GitHub import, sandbox preview, hosting/deployment workflows, and domain management.

## Active Architecture

The active deployment is:

```json
{
  "build": "vite build",
  "start": "node server/src/server.js"
}
```

This is not a static-only Vite deployment. The Express server is active and responsible for:

- serving the built React app from `dist/`
- health checks at `/healthz`
- GitHub import sandbox endpoints
- Render deploy/test-deploy endpoints
- serving sandbox previews from `/sandbox/:siteId`

The active server entry is:

```bash
server/src/server.js
```

The files `server/static-vite-server.mjs` and `server/render-single-service.mjs` are legacy/experimental helpers and are not the active Render start command.

## Local Development

Install dependencies:

```bash
npm install
```

Run the Vite dev server:

```bash
npm run dev
```

Run the production-style Express server locally:

```bash
npm run build
npm start
```

Local default:

```text
http://localhost:3001
```

Health check:

```text
http://localhost:3001/healthz
```

## App Mode

The frontend has one central mode switch:

```text
VITE_APP_MODE=demo
```

Supported values:

| Mode | Behavior |
|---|---|
| `demo` | local/demo data only; risky live provider calls are blocked |
| `live` | frontend may call Express endpoints for Render/GitHub workflows |
| `disabled` | live provider features report disabled |

Use `VITE_APP_MODE=live` only when the server-side Render variables are configured.

## Render Deployment

Recommended Render settings:

| Setting | Value |
|---|---|
| Runtime | Node |
| Root Directory | blank |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/healthz` |
| Node Version | `24.x` |

Required base environment:

| Variable | Purpose |
|---|---|
| `NODE_ENV=production` | production runtime |
| `DATA_DIR=/var/glondia/data` | persistent sandbox/import data on Render disk |

Render integration variables:

| Variable | Purpose |
|---|---|
| `RENDER_API_KEY` | server-side Render API access |
| `RENDER_SERVICE_ID` | optional default Render service target |
| `RENDER_DEPLOY_HOOK_URL` | optional simpler deploy trigger |
| `RENDER_OWNER_ID` | optional owner/team id for creating customer repo services |
| `PROVIDER_API_ENABLED` | set `false` to disable GitHub import and Render mutation endpoints |
| `PROVIDER_API_TOKEN` | optional bearer token required for provider mutation endpoints |
| `PROVIDER_RATE_LIMIT` | per-route provider API rate limit per minute |
| `GITHUB_REPO_ALLOWLIST` | optional comma-separated repo or owner allowlist for sandbox/import |
| `CORS_ORIGINS` | comma-separated allowed origins; production defaults to same-origin only |
| `SPACESHIP_API_KEY` | server-side Spaceship API key |
| `SPACESHIP_API_SECRET` | server-side Spaceship API secret |
| `SPACESHIP_API_BASE_URL` | optional Spaceship API base URL, defaults to `https://spaceship.dev/api/v1` |

Never expose Render API keys in the Vite client bundle.
Never expose Spaceship API keys or secrets in the Vite client bundle.

## Current Product Scope

The stable product direction is:

- Sites
- Builder
- GitHub import
- Sandbox preview
- Render deployment
- Domains
- Activity
- Settings

Storefront, orders, customers, tickets, messages, advanced analytics, and complex billing are later-stage modules and should not drive the current architecture.

## Backend Boundary

Short term: use the lightweight Express server in `server/src/server.js`.

Long term: extract heavier backend features into a separate service only after the core website build/publish flow is stable.

The `backend/` NestJS application is not the active deployment path right now. Do not maintain both Express and Nest as active backends at the same time.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the current boundary decision.

## Secrets

Use local env files only on your machine or configured Render environment variables in production.

Ignored secret files:

- `.env`
- `.env.local`
- `backend/.env`

Tracked examples:

- `.env.example`
- `backend/.env.example`

If a real API key has been pasted into chat, logs, exports, or screenshots, rotate it in the provider dashboard.
