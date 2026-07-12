# SiteBuilder Production Hardening — Rollout Log

Living record required by Phase 0 of the roadmap. Update this file as each
phase lands.

## Baseline

- Audited plan baseline: `4f90ab3965e04db716f31a629c95ed9521a895f4` (present in this repo's history)
- Test suite at start of hardening: `npm test` green (47 tests: VPS, tickets, admin oversight, architecture)
- Frontend build: green (`vite build`)
- Request correlation IDs: already global (`request-id.middleware.js`, mounted in `server.js`)

## Builder entry-point inventory (Phase 0)

| Surface | Path | Auth before hardening | Notes |
|---|---|---|---|
| Template catalog | `GET /api/template-ai/settings,/templates,/templates/:id(,preview)` | none (public catalog, SITE_BUILDER flag) | acceptable public reads |
| Template sites | `POST/GET /api/template-ai/sites*` (step 02) | auth + ownership | good |
| AI intake | `POST /api/template-ai/intake/{start,message,suggest-answer}` (step 03) | **none** | in-memory session Map; OpenAI spend |
| Legacy AI generate | `POST /api/template-ai/generate` (step 04) | **none** | base64-ZIP contract; OpenAI spend |
| AI edit site | `POST /api/template-ai/sites/:id/ai-edit` | auth + ownership | no rate limit before |
| Plan CRUD + AI suggest | `/api/template-ai/plans*` | auth (AI routes unlimited) | file-backed `sitePlanStore` |
| Generated preview | `GET /api/template-ai/sites/:id/preview` (step 06) | **none** | raw HTML on dashboard origin |
| ZIP deploy/validate | `POST /api/template-ai/zip/{deploy,validate}` | **none** | multer memoryStorage, MIME/extension check only |
| Handoff | `POST /api/template-ai/plans/:id/handoff` (step 07 + adapter) | auth | non-idempotent (Phase 8 target) |
| Hosting deploy engine | `/api/v1/hosting-deploy/*` | auth chain | JSON `hostingStore` (Phase 2/9 target) |
| Sandbox preview | `/sandbox/*` | hosting engine routes | main-origin (Phase 7 target) |
| Frontend flows | `BuilderRoxanne`, `AiTemplateSetup`, `BuilderSitePlan`, `BuilderEditor`, `BuilderImport`, `DeploymentSettings` | — | unification is Phase 5 |

Legacy data stores confirmed: `template-site-plans/plans.json` (sitePlanStore),
`template-sites.json` (templateSiteStore), `render-hosting.json` (hostingStore),
in-memory intake `Map` (step 03 controller).

## Feature flags (Phase 0)

Added to `server/src/config/featureFlags.js`, all server-enforced:

| Flag | Default | Purpose |
|---|---|---|
| `BUILDER_PROJECT_FLOW` | off | canonical project lifecycle (Phase 3/5) |
| `BUILDER_DB_STORAGE` | off | Prisma-backed builder state (Phase 2) |
| `BUILDER_ISOLATED_PREVIEW` | off | isolated preview origin (Phase 7) |
| `BUILDER_DURABLE_JOBS` | off | database-backed job worker (Phase 4) |
| `BUILDER_LEGACY_ROUTES` | on | legacy adapters stay reachable until cutover |

## Phase status

| Phase | Status | Date | Notes |
|---|---|---|---|
| 0 — Baseline & safety | **done** | 2026-07-12 | flags, inventory, correlation IDs verified, this log |
| 1 — P0 security hardening | **done (see scope note)** | 2026-07-12 | AI auth/rate/concurrency/prompt caps/audit; signed preview grants + CSP sandbox containment; ZIP auth + magic bytes + rate limit; security tests |
| 2 — Prisma production domain | not started | | |
| 3 — Canonical Builder API | not started | | |
| 4 — Durable job worker | not started | | |
| 5 — Unified frontend flow | not started | | |
| 6 — Safe generation/revisions | not started | | |
| 7 — Isolated preview service | not started | | Phase 1 interim: CSP `sandbox allow-scripts` opaque-origin containment |
| 8 — Idempotent handoff/billing | not started | | |
| 9 — Legacy migration/cutover | not started | | |
| 10 — CI/observability/launch | not started | | |

### Phase 1 scope note (deferred within phase)

- ZIP uploads still buffer in memory (25 MB cap): moving to disk-quarantine
  streaming requires reworking the base64→Render pipeline; scheduled with the
  Phase 2/6 artifact work. Mitigations now: auth, per-user rate limit, size cap,
  magic-byte signature check.
- Durable daily/monthly AI token quotas need the `AiUsageEvent` model —
  lands with Phase 2 schema. Interim: per-minute/per-hour rate limits +
  per-user concurrency cap + audit trail.
- In-memory intake sessions remain (now authenticated + rate-limited);
  replaced by project-backed intake in Phase 3/5.
