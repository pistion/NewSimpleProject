# Waste Management

This folder is a quarantine area for files that are not part of the active
GlondiaSites runtime on `localhost:3001`.

Active runtime kept in the main directory:

- `server/src/server.js` - Express API and static server.
- `src/` - root Vite React app source.
- `dist/` - built root app served by the Express server.
- `admin-dashboard/frontend/` - admin dashboard served at `/dashboard`.
- `landing/` - landing/static page assets.
- `public/` - Vite/public assets.
- `prisma/` - active Prisma schema and local SQLite database.
- `templates/` - live site-builder template library.
- `uploaded-sites/` - active/generated deploy workspace container.
- `.glondia-data/` - local runtime data store.

Quarantined buckets:

- `inactive-backends/` - old NestJS backend. The root README says it is not the
  active deployment path.
- `duplicate-dashboard-server/` - standalone dashboard backend/package that ran
  on port 4000. The active app serves only `admin-dashboard/frontend/` through
  the root server on port 3001.
- `legacy-server-entrypoints/` - old server helpers named in the README as
  legacy/experimental, plus their separate server package files.
- `docs-and-planning/` - planning, architecture, and refactor notes moved out of
  the root to keep the working app surface clean.
- `generated-test-sites/` - old wedding-car generated-site test outputs. The
  active `uploaded-sites/` folder remains in place for future generated sites.
- `local-agent-config/` - local assistant/editor config, not part of the app.

Validation after this move:

- `npm run build` passes.
- `http://localhost:3001/` returns 200.
- `http://localhost:3001/dashboard` returns 200.
- `http://localhost:3001/healthz` returns `ok`.

