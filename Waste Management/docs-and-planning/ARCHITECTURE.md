# Glondia — Platform Architecture

> ⚠️ **OUTDATED — describes the legacy NestJS backend, which is NOT the active deployment.**
> The live stack is the Express server at `server/src/server.js` + Vite React SPA.
> For current architecture see [README.md](README.md), [PROJECT_MAP.md](PROJECT_MAP.md),
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and
> [docs/SITE_BUILDER_HOSTING_BOUNDARY.md](docs/SITE_BUILDER_HOSTING_BOUNDARY.md).
> The `backend/` NestJS app described below is kept for reference only — do not run
> it alongside `server/`.

> **Owner:** Glondia Analysts & Consultancy · John Wesly Tawa  
> **Stack (legacy doc):** React (Vite) frontend · NestJS backend · SQLite (Render persistent disk)  
> **Deployed on:** Render.com

---

## 1. High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        GLONDIA PLATFORM                         │
│                                                                 │
│  ┌───────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │  Site Builder  │  │  Render Hosting │  │  Cloud Servers   │  │
│  │  (builder.jsx) │  │(hosting-control)│  │(vps-hosting.jsx) │  │
│  └───────────────┘  └─────────────────┘  └──────────────────┘  │
│          │                   │                     │            │
│          ▼                   ▼                     ▼            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    NestJS Backend (API)                    │ │
│  │         /api/v1/*    (JWT-guarded REST endpoints)          │ │
│  └────────────────────────────────────────────────────────────┘ │
│          │                   │                     │            │
│          ▼                   ▼                     ▼            │
│  ┌──────────┐      ┌──────────────┐      ┌──────────────────┐  │
│  │  GitHub  │      │  Render API  │      │   Vultr API v2   │  │
│  │  OAuth   │      │  (deploy +   │      │  (provision VPS) │  │
│  └──────────┘      │   monitor)   │      └──────────────────┘  │
│                    └──────────────┘                             │
│                                                                 │
│  ┌──────────────────┐   ┌────────────────────────────────────┐  │
│  │   Domains / DNS  │   │    Billing (PayPal + BSP Bank)     │  │
│  │ (domains.jsx)    │   │    per service, per deployment     │  │
│  └──────────────────┘   └────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Frontend (`src/`)

### 2.1 Entry & Routing

| File | Purpose |
|------|---------|
| `src/main.jsx` | React root mount |
| `src/App.jsx` | Single-page router — `route` state object `{ view, params }` drives all navigation. No React Router. |
| `src/components.jsx` | Shared primitives: `Logo`, `Badge`, `StatusBadge`, `Tabs`, `Stat`, `DashSidebar`, `DashTopbar`, `Empty`, `ToggleRow` |
| `src/icons.jsx` | All SVG icons via `ICN.*` — zero external icon library |
| `src/tweaks-panel.jsx` | Floating debug/theme panel (theme, accent, density, font pairing) |

### 2.2 Auth

| File | Purpose |
|------|---------|
| `src/features/auth/LoginPage.jsx` | Login form — demo mode always creates a local session |
| `src/features/auth/SignupPage.jsx` | Registration form |
| `src/api/auth.js` | `login()`, `register()`, `getStoredAuth()`, `clearAuthSession()`, `AUTH_CHANGED_EVENT` |

**Auth flow (current):** Demo mode — `login()` and `register()` create a localStorage session immediately without hitting the backend. Live auth (JWT via `/api/v1/auth/login`) is wired but disabled. Re-enable by restoring the `isLiveMode()` branch in `src/api/auth.js`.

### 2.3 Service Modules

---

#### 2.3.1 Render Hosting (`src/hosting-control.jsx`)

**What it is:** Managed web app deployment via Render.com. Customers deploy GitHub repos or Site Builder output; Glondia provisions and monitors Render services.

**UI structure:**

```
Render Hosting (hosting-list view)
├── My apps tab        — card grid of all deployments
│   ├── HostingAppCard — status, live URL, build progress
│   └── Deploy buttons — Site Builder / GitHub import
└── Settings tab       — HostingSettings component
    ├── Integration status cards (Render API, GitHub, Billing/PayPal)
    ├── How it works — 5-step guide
    └── Required env vars table

Hosting Detail (hosting-detail view)
├── Overview tab       — repo, branch, live URL, compact log
├── Billing tab        — PayPal checkout + BSP bank transfer
├── Environment Vars   — add/edit/delete + sync to Render
├── Persistent Disk    — attach SSD volumes
├── Domains            — custom domain + DNS records + SSL
├── Build Logs         — live EventSource log stream
└── Render Settings    — service ID, build/start commands
```

**API layer:** `src/api.js` → `src/api/render.js`  
**Key functions:** `listHostingDeployments`, `getHostingService`, `getRenderDeploymentStatus`, `redeployRenderDeployment`, `getRenderSettings`

**Required env vars (backend):**

| Variable | Purpose |
|----------|---------|
| `RENDER_API_KEY` | Authenticate with Render REST API |
| `RENDER_OWNER_ID` | Target Render account / team |
| `GITHUB_CLIENT_ID` | GitHub OAuth App |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App secret |
| `VITE_APP_MODE=live` | Frontend: switch from demo → live |

---

#### 2.3.2 Cloud Servers — VPS (`src/vps-hosting.jsx`)

**What it is:** Reseller VPS service powered by Vultr. Glondia buys Vultr instances at cost and resells to customers with a configurable markup (default 30%). Customers pay via PayPal; Glondia provisions the server automatically on payment capture.

**UI structure:**

```
Cloud Servers (vps-hosting view)
├── My servers tab     — table of all provisioned instances
│   └── Status, IP, specs, monthly price, click-through to detail
├── Plans & pricing tab — VpsPlans component
│   ├── Plan type selector (Cloud Compute / High Freq / High Perf / General Purpose)
│   └── Instance table — vCPU, RAM, SSD, transfer, monthly, hourly, Deploy →
└── Settings tab        — VpsSettings component
    ├── Integration status (Vultr API, PayPal, Sandbox mode)
    ├── Reseller margin card — markup % + 6 example margin calculations
    └── Plan catalog — base cost vs customer price vs margin per plan

Deploy server (vps-create view) — VpsCreateWizard
├── Step 0: Plan type       (can be pre-filled via route.params.planType)
├── Step 1: Region          (continent-grouped, flag emoji)
├── Step 2: Plan            (filtered by type + region, inline markup pricing)
├── Step 3: OS              (family-grouped, color-coded icons)
├── Step 4: Configure       (label, hostname, SSH mode, IPv6/backups/DDoS, cloud-init)
├── Step 5: Review          (full summary + backend quote with markup breakdown)
└── Step 6: Pay             (PayPal popup → polling → auto-provision)

Server detail (vps-detail view) — VpsDetail
├── Server details card     — IP, region, plan, vCPU/RAM/disk, OS, created
├── SSH connect card        — ready-to-copy ssh root@<ip> command
├── Billing card            — base cost + platform fee + total/month
└── Power controls          — Power on / Power off / Reboot / Destroy
```

**API layer:** `src/api/vultr.js` → backend `/api/v1/vps-hosting/*`  
**Security:** Vultr API key **never** touches the frontend. All Vultr calls are server-side only.

**Required env vars (backend):**

| Variable | Purpose |
|----------|---------|
| `VULTR_API_KEY` | Provision + manage Vultr instances |
| `PAYPAL_CLIENT_ID` | PayPal REST API |
| `PAYPAL_CLIENT_SECRET` | PayPal REST API secret |
| `PAYPAL_SANDBOX` | `true` (sandbox) / `false` (live charges) |
| `PLATFORM_MARKUP_PERCENT` | Reseller markup on Vultr base cost (default `30`) |
| `FRONTEND_URL` | Used in PayPal return/cancel URLs |

---

#### 2.3.3 Site Builder (`src/builder.jsx`)

**What it is:** No-code/low-code site creation tool. Completely separate from hosting and cloud servers. Creates sites using templates, AI, or external imports — then optionally deploys them via Render Hosting.

**UI structure:**

```
Site Builder (builder-gallery view) — BuilderGallery
├── Storefront templates    — e-commerce focused site templates
├── Site templates          — general purpose layouts
├── RoxanneAI              — AI-powered site generation
└── Import from GitHub      → builder-import view

Template Gallery (builder-templates view) — BuilderTemplates
└── Filter by category, preview, open editor

Builder Editor (builder-editor view) — BuilderEditor
├── Page list / editor
├── Publish to Render       — triggers deployment pipeline
└── Domain attachment

Import (builder-import view) — BuilderImport
├── GitHub repo import      — scans repo structure, deploys to Render
└── ZIP upload              — extract and deploy
```

**Key files:** `src/builder.jsx`, `src/storefront-templates.jsx`, `src/use-templates.js`, `src/use-sites.js`

---

#### 2.3.4 Domains (`src/domains.jsx`)

**UI structure:**

```
Domains (domains-mine view)    — list of registered domains
Buy a domain (domains-buy view) — search + register new domain
DNS records (dns view)          — DnsEditor with full record management
```

**API layer:** `src/api/domains.js`

---

#### 2.3.5 Other Dashboard Sections

| View | File | Purpose |
|------|------|---------|
| `overview` | `src/overview.jsx` | Dashboard landing — project stats, recent activity |
| `analytics` | placeholder | Cross-project analytics (roadmap) |
| `activity` | `src/activity.jsx` | Audit log / activity feed |
| `billing` | `src/App.jsx` → `BillingPageIntegrated` | Subscription plan, invoices, payment method |
| `settings` | placeholder | Workspace settings (roadmap) |

---

## 3. Backend (`backend/src/`)

### 3.1 Module Map

```
backend/src/
├── main.ts                          API entrypoint (port 3000, versioned /v1/)
├── app.module.ts                    Root module
├── config/
│   └── env.validation.ts            Zod schema for all env vars
├── database/
│   └── prisma.service.ts            PrismaClient wrapper
├── modules/
│   ├── auth/                        JWT auth (login, register, refresh)
│   │   ├── auth.controller.ts       POST /v1/auth/login|register|refresh
│   │   ├── auth.service.ts
│   │   └── guards/jwt-auth.guard.ts JwtAuthGuard (used on all protected routes)
│   ├── hosting/                     Render deployment management
│   │   ├── hosting.controller.ts    GET/POST /v1/hosting/*
│   │   └── hosting.service.ts
│   ├── vps-hosting/                 VPS reseller (Vultr + PayPal)
│   │   ├── vps-hosting.controller.ts
│   │   ├── vps-hosting.service.ts
│   │   └── dto/
│   │       ├── create-vps.dto.ts    region, plan, osId, label, SSH, options
│   │       ├── vps-quote.dto.ts     region, plan, osId → price quote
│   │       └── capture-paypal.dto.ts orderId
│   ├── domains/                     Domain registration + DNS
│   └── builder/                     Site builder backend
├── integrations/
│   └── vultr/
│       ├── vultr.service.ts         Vultr API v2 wrapper (regions, plans, OS, instances, SSH keys)
│       └── vultr.module.ts
└── common/
    └── types/request-with-context.ts  JWT actor context type
```

### 3.2 Database (Prisma / SQLite)

**Location:** `/var/glondia/data/glondia.db` (Render persistent disk)  
**Sync command:** `prisma db push --accept-data-loss` (not migrations — SQLite)

**Key models:**

| Model | Purpose |
|-------|---------|
| `User` | Authenticated user |
| `Organization` | Workspace / tenant |
| `HostingDeployment` | Render-managed site deployment |
| `EnvVar` | Per-deployment environment variables |
| `Domain` / `DnsRecord` | Domain registrations and DNS |
| `VpsService` | Provisioned Vultr VPS instance record |
| `VpsActionLog` | Audit log of all VPS actions (start/halt/reboot/destroy/create) |
| `BuilderSite` | Site Builder project |

### 3.3 VPS Hosting Service — Data Flow

```
Customer clicks "Deploy →" on a plan
        ↓
VpsCreateWizard (7 steps)
        ↓
POST /api/v1/vps-hosting/paypal/create-order
  → backend calls getQuote (Vultr plan cost × markup)
  → creates PayPal order via REST API
  → returns { orderId, approvalUrl, quote }
        ↓
Customer approves in PayPal popup
        ↓
Frontend polls POST /api/v1/vps-hosting/paypal/capture
  → backend captures PayPal payment (idempotent)
  → registers SSH key in Vultr if sshPublicKey provided
  → calls Vultr createInstance
  → saves VpsService record in DB with all billing fields
  → logs to VpsActionLog
  → returns serialized VPS record
        ↓
Frontend navigates to vps-detail view
```

### 3.4 API Endpoint Reference

#### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/login` | Email + password → access + refresh tokens |
| POST | `/api/v1/auth/register` | Create user + organization |
| POST | `/api/v1/auth/refresh` | Refresh token → new access token |

#### VPS Hosting (all require JWT)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/vps-hosting/settings` | Vultr/PayPal config status + markup % + sandbox flag |
| GET | `/api/v1/vps-hosting/regions` | Vultr region list |
| GET | `/api/v1/vps-hosting/plans?type=vc2` | Vultr plans (filterable by type) |
| GET | `/api/v1/vps-hosting/os` | Vultr OS image list |
| POST | `/api/v1/vps-hosting/quote` | Price quote with markup for a plan |
| POST | `/api/v1/vps-hosting/paypal/create-order` | Create PayPal order |
| POST | `/api/v1/vps-hosting/paypal/capture` | Capture payment + provision VPS |
| GET | `/api/v1/vps-hosting/services` | List org's VPS instances |
| GET | `/api/v1/vps-hosting/services/:id` | Get single VPS (refreshes from Vultr) |
| POST | `/api/v1/vps-hosting/services/:id/start` | Power on |
| POST | `/api/v1/vps-hosting/services/:id/halt` | Power off |
| POST | `/api/v1/vps-hosting/services/:id/reboot` | Reboot |
| DELETE | `/api/v1/vps-hosting/services/:id` | Destroy |

---

## 4. Infrastructure & Deployment

### 4.1 Render Services

| Service | Type | Branch | Build command |
|---------|------|--------|---------------|
| Frontend | Static Site | `main` | `npm run build` → `dist/` |
| Backend | Web Service | `main` | `prisma generate && prisma db push --accept-data-loss && nest build` |

### 4.2 Persistent Storage

| Mount | Contents |
|-------|---------|
| `/var/glondia/data` | SQLite database (`glondia.db`) |

### 4.3 Environment Variables

#### Frontend (Render static site)
| Variable | Value | Required |
|----------|-------|----------|
| `VITE_APP_MODE` | `live` | Yes — enables live API calls |
| `VITE_API_BASE_URL` | `https://your-backend.onrender.com` | Yes |

#### Backend (Render web service)
| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_URL` | `file:/var/glondia/data/glondia.db` | Yes |
| `JWT_ACCESS_SECRET` | Random 32+ char string | Yes |
| `JWT_REFRESH_SECRET` | Random 32+ char string | Yes |
| `RENDER_API_KEY` | Render REST API key | For hosting |
| `RENDER_OWNER_ID` | Render account/team ID | For hosting |
| `GITHUB_CLIENT_ID` | GitHub OAuth App | For GitHub deploys |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App secret | For GitHub deploys |
| `VULTR_API_KEY` | Vultr API key | For cloud servers |
| `PAYPAL_CLIENT_ID` | PayPal REST API | For payments |
| `PAYPAL_CLIENT_SECRET` | PayPal REST API secret | For payments |
| `PAYPAL_SANDBOX` | `true` / `false` | Defaults to `true` |
| `PLATFORM_MARKUP_PERCENT` | Reseller margin (e.g. `30`) | Defaults to `30` |
| `FRONTEND_URL` | Frontend URL (for PayPal redirects) | For payments |

---

## 5. Sidebar Navigation Map

```
Workspace
├── Overview          → /overview
├── Render Hosting    → /hosting-list        [My apps | Settings]
├── Cloud Servers     → /vps-hosting         [My servers | Plans & pricing | Settings]
├── Domains           → /domains-mine
│   ├── Buy a domain  → /domains-buy
│   └── DNS records   → /dns
└── Site builder      → /builder-gallery

Manage
├── Analytics         → /analytics
└── Activity          → /activity

Account
├── Billing           → /billing
└── Settings          → /settings
```

---

## 6. Security Notes

- **Vultr API key** is backend-only. Never sent to or stored in the frontend.
- **PayPal** payment capture is idempotent — duplicate `orderId` calls return the existing VPS record.
- **JWT guards** protect all dashboard API endpoints. The `JwtAuthGuard` extracts `userId` and `organizationId` from the token; all DB queries scope to the organization.
- **VPS access control** — `requireOwned()` checks `organizationId` on every VPS action. Returns `403` if the VPS belongs to a different org.

---

## 7. Service Boundaries (summary)

| Service | Source | Billing | Settings location |
|---------|--------|---------|-------------------|
| **Render Hosting** | GitHub / Site Builder / ZIP | PayPal per deploy | Hosting → Settings tab |
| **Cloud Servers** | Vultr API (reseller) | PayPal per month (markup applied) | Cloud Servers → Settings tab |
| **Site Builder** | Template / AI / Import | Free (part of platform) | N/A |
| **Domains** | Domain registrar API | Per domain | Domains section |

---

*Last updated: 2026-05-27*
