# Glondia Sites Backend

> Status: archived/inactive. This NestJS backend is not part of the active Render deployment path. The current product uses the Vite frontend plus the lightweight Express server in `server/src/server.js`.

Phase 0 backend scaffold for the Glondia Sites platform.

## Architecture Boundary

Do not treat this folder as an active backend while `server/src/server.js` is the deployed runtime. New product behavior for the current app should go into the lightweight Express server first.

This Nest backend may be revived later as a separate service if the product needs a heavier API, database, queue, and RBAC layer after the build-and-publish workflow is stable.

## Stack

- NestJS + TypeScript
- PostgreSQL + Prisma
- Redis-ready Docker service
- OpenAPI at `/api/docs`
- Versioned API under `/api/v1`

## Local Commands

```sh
npm install
npm run prisma:generate
npm run build
npm test
```

To run the full local backend stack:

```sh
cp .env.example .env
docker compose up --build
```

Health endpoint:

```txt
GET http://localhost:4000/api/v1/health
```

Auth endpoints:

```txt
POST http://localhost:4000/api/v1/auth/register
POST http://localhost:4000/api/v1/auth/login
POST http://localhost:4000/api/v1/auth/refresh
POST http://localhost:4000/api/v1/auth/logout
GET  http://localhost:4000/api/v1/auth/me
GET  http://localhost:4000/api/v1/workspace
GET  http://localhost:4000/api/v1/activity
GET  http://localhost:4000/api/v1/audit
GET  http://localhost:4000/api/v1/billing/summary
GET  http://localhost:4000/api/v1/projects
POST http://localhost:4000/api/v1/projects
GET  http://localhost:4000/api/v1/projects/:projectId
PATCH http://localhost:4000/api/v1/projects/:projectId
DELETE http://localhost:4000/api/v1/projects/:projectId
GET  http://localhost:4000/api/v1/projects/:projectId/env-vars
POST http://localhost:4000/api/v1/projects/:projectId/env-vars
PATCH http://localhost:4000/api/v1/projects/:projectId/env-vars/:envVarId
DELETE http://localhost:4000/api/v1/projects/:projectId/env-vars/:envVarId
GET  http://localhost:4000/api/v1/projects/:projectId/deployments
POST http://localhost:4000/api/v1/projects/:projectId/deployments
GET  http://localhost:4000/api/v1/projects/:projectId/artifacts
GET  http://localhost:4000/api/v1/deployments/:deploymentId
POST http://localhost:4000/api/v1/deployments/:deploymentId/cancel
POST http://localhost:4000/api/v1/deployments/:deploymentId/rollback
GET  http://localhost:4000/api/v1/deployments/:deploymentId/logs
GET  http://localhost:4000/api/v1/artifacts/:artifactId
GET  http://localhost:4000/api/v1/domains
POST http://localhost:4000/api/v1/domains
GET  http://localhost:4000/api/v1/domains/:domainId
PATCH http://localhost:4000/api/v1/domains/:domainId
DELETE http://localhost:4000/api/v1/domains/:domainId
GET  http://localhost:4000/api/v1/domains/:domainId/dns-records
POST http://localhost:4000/api/v1/domains/:domainId/dns-records
PATCH http://localhost:4000/api/v1/domains/:domainId/dns-records/:recordId
DELETE http://localhost:4000/api/v1/domains/:domainId/dns-records/:recordId
```

## Current Scope

This first integration covers the backend spine only: app bootstrap, env validation, request IDs, response/error envelopes, Prisma wiring, Docker Compose, and health checks.

The core Phase 1 schema now includes identity, sessions, OAuth/API key placeholders, organizations, members, roles, permissions, activity logs, and audit logs. Auth registration and login now create users, organizations, owner memberships, sessions, JWT access tokens, refresh tokens, and audit events. Refresh/logout support token rotation and session revocation, and `GET /auth/me` verifies the first JWT guard. `GET /workspace` verifies organization context plus RBAC permission checks with `organization:read`. Projects now have tenant-scoped CRUD endpoints with activity logging and `project:*` permission enforcement. Project environment variables are encrypted at rest, masked in responses, audited on mutation, and protected by `project:env:manage`. Deployments can now be queued, listed, read, inspected through tenant-scoped logs, cancelled, and marked as rolled back.
The deployment queue uses BullMQ/Redis. Creating a deployment enqueues `processDeploymentBuild`; the worker now advances queued deployments through `building`, `uploading`, and `deployed`, calls a replaceable `BuildRunnerService`, writes structured log entries for each transition, records a deployment artifact object, and marks in-progress deployments as `failed` if the worker throws. Deployments now include artifact metadata in API responses, and artifacts can be listed/read through tenant-scoped `asset:read` endpoints. Projects can store a Render service ID; when `RENDER_API_KEY` is configured, manual deployment creation triggers Render's deploy API for that service instead of the local worker and stores Render deploy metadata on the deployment. Domains now have tenant-scoped CRUD endpoints, optional project linking, soft archive behavior, DNS record CRUD, domain/dns RBAC permissions, and activity/audit logging for mutations. Billing now has plan, subscription, invoice, and usage-record schema plus a tenant-scoped billing summary endpoint protected by `billing:read`.

The frontend now has an API client and can load projects from the backend when `VITE_API_BASE_URL` is set and an access token is stored, while keeping mock data as a fallback. The dashboard topbar includes a compact login/register menu that stores backend auth tokens and reloads project data after sign-in. Project detail tabs can now load deployments, deployment logs, artifacts, and environment variables from the backend with graceful prototype fallbacks. Hosting screens can now create projects, store Render service IDs, trigger manual production deployments, redeploy from detail/log views, cancel queued/building deployments, roll back ready deployments, inspect deployment artifact objects, add/update/delete environment variables, save project settings, pause projects, archive projects, and connect/unlink/archive managed domains through the backend API, refreshing the visible data after each mutation. Domain screens can now list managed domains, create domains from checkout for signed-in users, and load/create/update/delete DNS records through the backend with mock fallbacks. The overview activity feed and Activity page can now read backend activity/audit logs with prototype fallbacks. The Billing page can now load plan, invoice, and usage data from the backend billing summary endpoint with a prototype fallback.

Next slices should add real artifact upload/build execution behind `BuildRunnerService`, frontend artifact detail/download affordances, fuller domain settings such as auto-renew and WHOIS privacy controls, or billing management actions such as plan changes and payment-provider checkout.
