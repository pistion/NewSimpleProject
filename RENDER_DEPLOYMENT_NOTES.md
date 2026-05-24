# Render single-service deployment checklist

This repo is configured for one public Render Web Service.

The service:

- builds the React frontend into `dist`
- builds the Nest backend into `backend/dist`
- starts one Node launcher at `server/render-single-service.mjs`
- serves the React app from `/`
- proxies `/api/*` to the Nest backend on an internal localhost port

## Blueprint path

Use the root `render.yaml`:

1. Render Dashboard -> Blueprints -> New Blueprint Instance.
2. Select this repository.
3. Confirm it creates:
   - `glondiasites` as the only public Web Service
   - `glondia-db` as Postgres
   - `glondia-redis` as Redis
4. After first deploy, open `glondiasites` -> Environment and fill the `sync: false` secrets you actually use.

## Manual service settings

Use Web Service.

- Root Directory: blank
- Build Command: `npm run build:render`
- Start Command: `npm start`
- Health Check Path: `/api/v1/health`
- Node Version: `24.14.1`

## Required environment

- `NODE_ENV=production`
- `INTERNAL_API_PORT=4001`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `FIELD_ENCRYPTION_KEY`
- `APP_URL=https://glondiasites.onrender.com`
- `API_BASE_URL=https://glondiasites.onrender.com/api/v1`
- `FRONTEND_URL=https://glondiasites.onrender.com`
- `CORS_ORIGINS=https://www.glondiasites.com,https://glondiasites.com,https://glondiasites.onrender.com`
- `RENDER_API_BASE_URL=https://api.render.com/v1`
- `RENDER_API_KEY` if using Render deploy triggers

Optional provider keys can stay blank until their feature is used.

## Custom domain

After the service is live, add custom domains to the single `glondiasites` web service:

- `www.glondiasites.com`
- `glondiasites.com`

Then update:

- `APP_URL`
- `API_BASE_URL`
- `FRONTEND_URL`
- `CORS_ORIGINS`
- GitHub OAuth callback URL, if GitHub login is enabled
