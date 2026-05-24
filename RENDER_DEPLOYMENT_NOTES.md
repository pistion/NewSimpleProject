# Render Vite Deployment Checklist

This repo now deploys as one clean Vite React app.

The service:

- installs root npm dependencies
- builds the React app into `dist`
- starts `server/static-vite-server.mjs`
- serves the app from `/`
- uses `/healthz` for Render health checks

There is no Render Postgres, Redis, Prisma migration, Nest backend, JWT secret, or `/api/v1` process in the deploy path.

## Blueprint Path

Use the root `render.yaml`:

1. Render Dashboard -> Blueprints -> New Blueprint Instance.
2. Select this repository.
3. Confirm it creates only `glondiasites` as the public Web Service.
4. The optional persistent disk is mounted at `/var/glondia`.

## Manual Service Settings

Use Web Service.

- Root Directory: blank
- Build Command: `npm ci && npm run build`
- Start Command: `npm start`
- Health Check Path: `/healthz`
- Node Version: `24.14.1`

## Required Environment

Only this is needed:

- `NODE_ENV=production`

The frontend stores app state locally in browser storage for this Vite-only build.
