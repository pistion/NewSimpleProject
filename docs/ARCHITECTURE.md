# Architecture Boundary

## Active Runtime

Glondia Sites currently ships as one deployable app:

- Vite React frontend
- Lightweight Express server
- Render Node web service
- Persistent disk-backed sandbox storage

Active commands:

```bash
npm run build
npm start
```

Active server entry:

```text
server/src/server.js
```

## Current Backend Strategy

Short term, the Express server is the only active backend. It owns:

- serving `dist/`
- `/healthz`
- GitHub import and sandbox preview
- Render service activation, test deploy, and deploy calls
- lightweight local/demo API behavior

This keeps the product focused while the build-and-publish workflow is still changing.

## App Modes

Client mode is centralized in `src/app/config.js`.

```text
demo     local/demo data only
live     calls the Express server for live provider workflows
disabled provider workflows are hidden or blocked
```

Render client calls are gated behind `VITE_APP_MODE=live` so test/demo UI cannot accidentally look like a real deploy.

Spaceship registrar and DNS calls are server-proxied through `/api/spaceship/*` and also require `VITE_APP_MODE=live` on the client. Secrets stay server-side in `SPACESHIP_API_KEY` and `SPACESHIP_API_SECRET`.

## Inactive Backend

The NestJS backend in `backend/` is archived/inactive for now. It may be useful later, but it is not part of the current Render deploy path.

Do not add new product behavior to both `server/` and `backend/`. If a feature is needed now, put it in `server/`. If the product later outgrows the lightweight server, extract the serious backend into a separate service deliberately.

## Decision

Current decision:

```text
Use Vite + Express as the active product architecture.
Keep Nest as reference/archive only.
Do not maintain two active backends.
```

## Next Refactor Boundary

The next source-level cleanup should start with `src/api.js`. Split it into smaller modules before moving broader frontend folders.

Recommended target:

```text
src/api/
  client.js
  localDb.js
  auth.js
  projects.js
  domains.js
  builder.js
  render.js
```

Started:

```text
src/api/auth.js
src/api/builder.js
src/api/domains.js
src/api/github.js
src/api/localDb.js
src/api/mappers.js
src/api/projects.js
src/api/render.js
src/app/config.js
```

`src/api.js` remains the compatibility export surface while API areas are migrated one at a time.
