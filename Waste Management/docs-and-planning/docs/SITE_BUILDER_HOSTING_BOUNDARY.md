# Site Builder / Hosting Boundary

## Core Rule

Site Builder prepares websites. Hosting Deploy Engine deploys websites. Render Hosting Hub manages live websites.

The active production runtime is the Vite React frontend with the Express server at `server/src/server.js`.
The `backend/` NestJS folder is not the active deployment path right now.

## Ownership

| Area | Owns | Must not own |
|---|---|---|
| Site Builder | Template choice, RoxanneAI intake, generated or edited content, source import, ZIP preparation, GitHub source preparation, framework detection, recommended build settings, handoff packaging | Render credentials, final deployment records, final live URL authority, env vars, disks, domains, billing, redeploy, suspend, delete, sync |
| Hosting Deploy Engine | Builder handoffs, ZIP handoffs, GitHub handoffs, controlled-source publishing, Render payload creation, Render service creation, deploy triggers, hosting records, hosting logs, deploymentId responses | Builder editing UX, live-site management UI |
| Render Hosting Hub | Hosted site list, deployment status, live URLs, Render sync, redeploy, suspend, resume, restart, delete, env vars, secret files, disks, domains, headers, routes, billing, logs, deploy history | Builder content preparation, AI generation, ZIP/GitHub source preparation |

## Flow Boundary

Builder pages should send prepared handoffs to the Hosting Deploy Engine and then redirect to Hosting Detail. Hosting Detail is the control room for every live-site operation.

Legacy routes and compatibility wrappers can remain during migration, but new calls should use Hosting Deploy Engine endpoints instead of Template AI or Builder owning deployment directly.
