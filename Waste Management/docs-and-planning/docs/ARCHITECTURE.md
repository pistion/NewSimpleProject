# Glondia Sites — Full Architecture Map

> Generated 2026-05-27. Reflects current codebase state including all identified clutter.

---

## 1. Top-Level Structure

```
Glondiasites/
├── backend/          NestJS API (primary business logic)
├── server/           Express.js production server (serves frontend + proxies API)
├── src/              React frontend (Vite)
├── landing/          Static landing page assets
├── public/           Static public assets
├── dist/             Vite build output (generated)
├── docs/             Documentation
├── package.json      Root scripts (dev/build/start)
├── vite.config.js    Vite config (dev proxy → localhost:3001)
├── render.yaml       Render.com deployment blueprint
└── .env.example      Environment variable template
```

---

## 2. Backend — NestJS

**Location:** `backend/`
**Entry point:** `backend/src/main.ts`
**Database:** SQLite via Prisma
**Auth:** JWT + RBAC
**Queue:** BullMQ (deployment jobs)

### 2.1 Backend Directory

```
backend/
├── src/
│   ├── main.ts                              Entry point, Swagger, CORS, middleware
│   ├── app.module.ts                        Root module (imports all feature modules)
│   ├── common/                              Shared infrastructure
│   │   ├── guards/rbac.guard.ts             Role-based access control
│   │   ├── decorators/require-permissions.decorator.ts
│   │   ├── filters/api-exception.filter.ts  Global error handling
│   │   ├── interceptors/response-envelope.interceptor.ts
│   │   ├── middleware/request-id.middleware.ts
│   │   ├── email/email.service.ts
│   │   ├── crypto/crypto.service.ts
│   │   ├── types/request-with-context.ts   Extended Request (auth context)
│   │   ├── json-field.ts
│   │   └── prisma-enums.ts
│   ├── config/
│   │   ├── app.config.ts                   App config (port, env)
│   │   └── env.validation.ts               Zod env var schema
│   ├── database/
│   │   ├── database.module.ts
│   │   └── prisma.service.ts               Prisma client wrapper
│   ├── integrations/
│   │   ├── github/                         GitHub OAuth + API client
│   │   └── render/                         Render.com API client
│   ├── modules/                            Feature modules (17 total)
│   └── workers/                            Background job processing
├── prisma/
│   ├── schema.prisma                       Database schema (50+ models)
│   ├── migrations/                         Migration history
│   └── seed.ts
├── Dockerfile
├── docker-compose.yml
├── nest-cli.json
└── tsconfig.json
```

### 2.2 Feature Modules (17)

Each module contains: `{name}.module.ts`, `{name}.controller.ts`, `{name}.service.ts`, `{name}.repository.ts`, `dto/`

| Module | Path | Responsibility |
|--------|------|----------------|
| **Auth** | `src/modules/auth/` | JWT auth, register, login, refresh, logout, invite accept |
| **Projects** | `src/modules/projects/` | Project CRUD, environment variables |
| **Deployments** | `src/modules/deployments/` | Deployment orchestration, cancel, rollback |
| **Domains** | `src/modules/domains/` | Custom domains, DNS records, SSL |
| **SSL** | `src/modules/ssl/` | SSL certificate management |
| **Organizations** | `src/modules/organizations/` | Multi-tenant orgs, members, roles |
| **Builder** | `src/modules/builder/` | Site builder (sites, pages, versions, templates) |
| **Billing** | `src/modules/billing/` | Subscriptions, invoices, Stripe/PayPal |
| **Registrar** | `src/modules/registrar/` | Domain registration via Spaceship API |
| **Storage** | `src/modules/storage/` | File storage (S3/local) — service only, no controller |
| **Webhooks** | `src/modules/webhooks/` | Outgoing webhook endpoints and deliveries |
| **Notifications** | `src/modules/notifications/` | In-app notifications, user preferences |
| **Activity** | `src/modules/activity/` | Activity logging |
| **Artifacts** | `src/modules/artifacts/` | Build artifact management |
| **Admin** | `src/modules/admin/` | Admin-only operations |
| **Health** | `src/modules/health/` | Health check endpoint |
| **Workspace** | `src/modules/workspace/` | Workspace management |

### 2.3 REST API Endpoints

**Base:** `/api/v1`
**Docs:** `/api/docs` (Swagger UI)

| Method | Path | Auth | Module |
|--------|------|------|--------|
| POST | `/v1/auth/register` | Public | Auth |
| POST | `/v1/auth/login` | Public (throttled) | Auth |
| POST | `/v1/auth/refresh` | Public (throttled) | Auth |
| POST | `/v1/auth/logout` | Public | Auth |
| GET | `/v1/auth/me` | JWT | Auth |
| POST | `/v1/auth/invites/:token/accept` | JWT | Auth |
| GET | `/v1/health` | Public | Health |
| GET | `/v1/projects` | JWT + RBAC | Projects |
| POST | `/v1/projects` | JWT + RBAC | Projects |
| GET | `/v1/projects/:projectId` | JWT + RBAC | Projects |
| PATCH | `/v1/projects/:projectId` | JWT + RBAC | Projects |
| DELETE | `/v1/projects/:projectId` | JWT + RBAC | Projects |
| GET | `/v1/projects/:projectId/env-vars` | JWT + RBAC | Projects |
| POST | `/v1/projects/:projectId/env-vars` | JWT + RBAC | Projects |
| GET | `/v1/projects/:projectId/env-vars/export` | JWT + RBAC | Projects |
| PATCH | `/v1/projects/:projectId/env-vars/:envVarId` | JWT + RBAC | Projects |
| DELETE | `/v1/projects/:projectId/env-vars/:envVarId` | JWT + RBAC | Projects |
| POST | `/v1/projects/:projectId/deployments` | JWT + RBAC | Deployments |
| POST | `/v1/deployments/:deploymentId/cancel` | JWT + RBAC | Deployments |
| POST | `/v1/deployments/:deploymentId/rollback` | JWT + RBAC | Deployments |
| GET | `/v1/domains` | JWT + RBAC | Domains |
| POST | `/v1/domains` | JWT + RBAC | Domains |
| PATCH | `/v1/domains/:domainId` | JWT + RBAC | Domains |
| DELETE | `/v1/domains/:domainId` | JWT + RBAC | Domains |
| POST | `/v1/domains/:domainId/dns-records` | JWT + RBAC | Domains |
| PUT | `/v1/domains/:domainId/dns-records/:recordId` | JWT + RBAC | Domains |
| DELETE | `/v1/domains/:domainId/dns-records` | JWT + RBAC | Domains |
| GET | `/v1/organizations` | JWT + RBAC | Organizations |
| POST | `/v1/organizations/:orgId/members` | JWT + RBAC | Organizations |
| PATCH | `/v1/organizations/:orgId/members/:memberId` | JWT + RBAC | Organizations |
| DELETE | `/v1/organizations/:orgId/members/:memberId` | JWT + RBAC | Organizations |
| POST | `/v1/registrar` | JWT + RBAC | Registrar |
| GET | `/v1/registrar` | JWT + RBAC | Registrar |
| POST | `/v1/webhooks` | JWT + RBAC | Webhooks |
| GET | `/v1/webhooks` | JWT + RBAC | Webhooks |
| PATCH | `/v1/webhooks/:webhookId` | JWT + RBAC | Webhooks |
| DELETE | `/v1/webhooks/:webhookId` | JWT + RBAC | Webhooks |
| POST | `/v1/admin` | JWT + Admin Role | Admin |

### 2.4 Auth & RBAC

```
Auth Flow:
  POST /v1/auth/login
    → JwtService signs access + refresh tokens
    → Session stored in DB

  Protected routes:
    → JwtAuthGuard validates Authorization header
    → Injects user + org context into request (X-Organization-Id header)
    → RbacGuard checks @RequirePermissions() decorator

Permission scopes (examples):
  project:read, project:create, project:delete, project:env:manage
  domain:read, domain:create, domain:delete
  org:manage, billing:manage
```

### 2.5 Background Workers

```
backend/src/workers/
├── build-runner/
│   ├── build-runner.module.ts
│   └── build-runner.service.ts       Executes builds for deployments
├── processors/
│   └── deployment.processor.ts       BullMQ job processor
└── queues/
    ├── queue.module.ts
    ├── queue.constants.ts
    └── deployment-queue.service.ts   Enqueues deployment jobs
```

### 2.6 Integrations

```
backend/src/integrations/
├── github/
│   ├── github.controller.ts          Webhook handlers
│   ├── github.service.ts             GitHub API client
│   └── github.types.ts
└── render/
    ├── render.controller.ts          Render.com webhook handlers
    └── render.service.ts             Render API client
```

### 2.7 Database Schema (Prisma — SQLite)

**50+ models across these domains:**

| Domain | Models |
|--------|--------|
| **Identity** | User, Session, OauthAccount |
| **Access** | Organization, OrganizationMember, OrganizationInvite, Role, Permission, RolePermission, ApiKey |
| **Projects** | Project, ProjectEnvironmentVariable |
| **Domains** | Domain, DnsRecord, SslCertificate |
| **Builder** | BuilderSite, BuilderPage, BuilderPageVersion, Template |
| **Deployments** | Deployment, DeploymentLog, DeploymentAlias, Artifact |
| **Billing** | BillingPlan, BillingSubscription, BillingInvoice, BillingUsageRecord, CheckoutOrder, Payment, PaymentLineItem |
| **Activity** | ActivityLog, AuditLog |
| **Notifications** | Notification, NotificationPreference |
| **Webhooks** | WebhookEvent, OutgoingWebhookEndpoint, OutgoingWebhookDelivery |
| **Storage** | Asset |

**Migrations** (`backend/prisma/migrations/`):
- `20260521000000_core_identity_rbac`
- `20260521001000_projects_foundation`
- `20260521002000_project_environment_variables`
- `20260521003000_deployments_foundation`
- `20260521004000_artifacts_foundation`
- `20260521005000_domains_dns_foundation`
- `20260521006000_billing_foundation`
- `20260522000000_builder_ssl_assets_billing_notifications_webhooks`
- `20260522010000_org_invites_webhook_endpoints_builder_fixes`
- `20260523001000_render_provider_fields`

---

## 3. Frontend — React (Vite)

**Location:** `src/`
**Framework:** React + React Router v7
**Build tool:** Vite
**Dev port:** 5173 (proxies `/api` to localhost:3001)

### 3.1 Frontend Directory

```
src/
├── main.jsx                         React entry point
├── App.jsx                          Root wrapper
├── app/
│   ├── App.jsx                      Main shell
│   ├── routes.jsx                   All route definitions
│   ├── config.js                    App config
│   └── layout/
│       ├── DashboardLayout.jsx      Authenticated layout (sidebar + topbar)
│       └── PublicLayout.jsx         Public pages layout (navbar + footer)
├── api/                             API client layer
│   ├── api.js                       Base request function
│   ├── auth.js
│   ├── projects.js
│   ├── domains.js
│   ├── builder.js
│   ├── github.js
│   ├── render.js
│   ├── mappers.js                   API response mappers
│   └── localDb.js                   Local storage abstraction
├── features/                        Pages by domain
│   ├── auth/                        LoginPage, SignupPage
│   ├── dashboardOverview/           DashboardOverview
│   ├── projects/                    ProjectsPage, ProjectDetailPage
│   ├── domains/                     DomainsPage
│   ├── hosting/                     HostingPage
│   ├── builder/                     Site builder UI
│   ├── billing/                     BillingPage
│   ├── account/                     AccountPage
│   ├── settings/                    SettingsPage
│   ├── storefront/                  StorefrontPage
│   ├── products/                    ProductsPage
│   ├── categories/                  CategoriesPage
│   ├── pages/                       PagesPage
│   ├── ordersUi/                    OrdersUiPage
│   ├── customersUi/                 CustomersUiPage
│   ├── seo/                         SeoPage
│   ├── media/                       MediaPage
│   ├── analytics/                   AnalyticsPage
│   ├── messages/                    MessagesPage
│   ├── tickets/                     TicketsPage
│   ├── publicHome/                  HomePage + HomeHero, ServiceOverview, ProcessSection, etc.
│   ├── publicServices/              ServicesPage
│   ├── publicPortfolio/             PortfolioPage
│   ├── publicPricing/               PricingPage
│   ├── publicProcess/               ProcessPage
│   ├── publicSupport/               SupportPage
│   └── publicContact/               ContactPage
├── components/
│   ├── common/                      ConfirmModal, EmptyState, Logo, PageHeader, StatusBadge
│   ├── dashboard/                   DashboardCard, DashboardSidebar, DashboardTable, DashboardTopbar, ProjectSelector
│   └── public/                      PublicNavbar, PublicFooter
├── services/
│   ├── accountService.js
│   └── messagesService.js
├── data/
│   ├── dashboardMockData.js
│   ├── ecommerceMetaFields.js
│   └── publicContent.js
└── icons.jsx
```

### 3.2 Routes

**Public:**

| Path | Component |
|------|-----------|
| `/` | HomePage |
| `/services` | ServicesPage |
| `/portfolio` | PortfolioPage |
| `/pricing` | PricingPage |
| `/process` | ProcessPage |
| `/support` | SupportPage |
| `/contact` | ContactPage |
| `/login` | LoginPage |
| `/signup` | SignupPage |

**Dashboard (JWT protected):**

| Path | Component |
|------|-----------|
| `/dashboard` | DashboardOverview |
| `/dashboard/projects` | ProjectsPage |
| `/dashboard/projects/:projectId` | ProjectDetailPage |
| `/dashboard/storefront` | StorefrontPage |
| `/dashboard/products` | ProductsPage |
| `/dashboard/categories` | CategoriesPage |
| `/dashboard/orders-ui` | OrdersUiPage |
| `/dashboard/customers-ui` | CustomersUiPage |
| `/dashboard/pages` | PagesPage |
| `/dashboard/seo` | SeoPage |
| `/dashboard/media` | MediaPage |
| `/dashboard/domains` | DomainsPage |
| `/dashboard/hosting` | HostingPage |
| `/dashboard/analytics` | AnalyticsPage |
| `/dashboard/messages` | MessagesPage |
| `/dashboard/tickets` | TicketsPage |
| `/dashboard/billing` | BillingPage |
| `/dashboard/account` | AccountPage |
| `/dashboard/settings` | SettingsPage |

---

## 4. Express Server (Production Layer)

**Location:** `server/`
**Purpose:** Production entry point — serves built frontend from `/dist`, routes `/api/*` to NestJS backend

```
server/
├── src/
│   ├── server.js                    Main Express app
│   ├── controllers/                 33 Express route handlers
│   ├── services/                    Business logic services
│   ├── routes/                      Route definitions (~24 files)
│   ├── middleware/                  Express middleware
│   └── utils/
├── render-single-service.mjs        Render.com deployment helper
└── package.json
```

**Key controllers:** auth, project, deployment, domain, env-var, site, site-editor, billing, workspace, dns, product, order, lead, analytics, event-tracking, publish, admin

---

## 5. Configuration & Environment

### Root Scripts

| Command | Action |
|---------|--------|
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | Build frontend to `/dist` |
| `npm start` | Start Express production server (port 3001) |

### Backend Scripts (`backend/`)

| Command | Action |
|---------|--------|
| `npm run start:dev` | NestJS watch mode |
| `npm run build` | Compile TypeScript |
| `npm run prisma:migrate` | Run DB migrations |
| `npm run prisma:studio` | Prisma UI (port 5555) |
| `npm test` | Jest tests |

### Key Environment Variables

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE_URL` | Frontend API URL |
| `VITE_APP_MODE` | `demo` or `live` |
| `DATABASE_URL` | Prisma connection string |
| `ENCRYPTION_KEY` | Env var encryption |
| `CORS_ORIGINS` | Allowed CORS origins |
| `RENDER_API_KEY` / `RENDER_SERVICE_ID` | Render.com integration |
| `GITHUB_REPO_ALLOWLIST` | Allowed GitHub repos |
| `SPACESHIP_API_KEY` / `SPACESHIP_SECRET` | Domain registrar |
| `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` | PayPal billing |
| `PLATFORM_MARKUP_PERCENT` | Billing markup |

---

## 6. Identified Clutter

### 6.1 Duplicate Files in `server/` — Competing Implementations

These pairs exist simultaneously; only one in each pair should be active:

| Keep | Remove (stale) |
|------|----------------|
| `server/src/controllers/deployment.controller.js` | `server/src/controllers/deploymentController.js` |
| `server/src/controllers/domain.controller.js` | `server/src/controllers/domainController.js` |
| `server/src/controllers/env-var.controller.js` | `server/src/controllers/environmentController.js` |
| `server/src/routes/deployment.routes.js` | `server/src/routes/deploymentRoutes.js` |
| `server/src/routes/domain.routes.js` | `server/src/routes/domainRoutes.js` |

### 6.2 Stale Frontend Files at `src/` Root

Pre-refactor files no longer routed to — candidates for deletion:

- `src/activity.jsx`
- `src/builder.jsx`
- `src/hosting.jsx`
- `src/hosting-control.jsx`
- `src/marketing.jsx`
- `src/overview.jsx`
- `src/domains.jsx`
- `src/components.jsx`
- `src/data.js` (likely duplicates `src/data/data.js`)

---

## 7. System Diagram

```
Browser
  │
  ├── Public routes (/)
  │     └── React app (Vite / dist/)
  │
  └── Dashboard routes (/dashboard/*)
        └── React app → API calls → /api/v1/*
                                        │
                              Express server (server/)
                                        │ proxies /api/*
                                        │
                              NestJS backend (backend/)
                                        │
                              ┌─────────┴──────────┐
                              │                    │
                           SQLite              BullMQ queue
                         (Prisma)             (deployment jobs)
                              │                    │
                         50+ models         BuildRunnerService
                                                   │
                                        ┌──────────┴──────────┐
                                        │                     │
                                   GitHub API           Render.com API
```
