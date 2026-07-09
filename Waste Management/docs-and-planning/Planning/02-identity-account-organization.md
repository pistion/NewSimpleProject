# 02 - Identity, Account, And Organization Implementation Plan

## Goal

Make identity clear and production-ready. Every customer, admin, service, payment, ticket, activity event, and dashboard action must be traceable to a real user and, where applicable, an organization/account.

The system must support:

- customer users
- admin users
- multiple accounts/organizations later
- account lifecycle states
- user profile details
- safe authentication records
- dashboard ownership and auditing

## Current State

The current Prisma schema has `User` and `RefreshToken`.

Current `User` already supports:

- `email`
- `passwordHash`
- `name`
- `role`
- `planId`
- `phone`
- `profileDetails`
- `idPhotoPath`
- `avatarPath`
- `accountStatus`
- disabled/deleted/reactivated fields
- promo lifecycle fields

Current auth middleware already blocks:

```txt
disabled
deleted
suspended
```

Current roles:

```txt
owner
admin
member
```

This is usable for v1. Do not replace auth. Extend it carefully.

## Production Identity Rules

User identity rules:

- `User.id` is the permanent internal user ID.
- `User.email` is unique and used for login.
- `User.passwordHash` must never be returned by any API.
- `User.idPhotoPath` and `User.avatarPath` must never be returned as raw filesystem paths.
- Admin list APIs may expose booleans like `hasIdPhoto` and safe routes like `/api/admin/users/:id/avatar`.
- Suspended, disabled, and deleted users must not access customer routes even if their JWT is still valid.
- Admin actions must always write `AuditLog`.

Account lifecycle:

```txt
active:
user can log in and use services if service access allows it

suspended:
temporary block; reversible; refresh tokens revoked; active services may be suspended

disabled:
stronger block; admin review needed; refresh tokens revoked

deleted:
soft delete only; user row remains for payment and audit history
```

## Organization Model

The current schema does not have a full `Organization` table in Prisma, but many tables already carry `organizationId`.

For v1, use this staged approach:

## Multiple Accounts Meaning

The product requirement says one user may create or manage multiple accounts. For production, define this carefully so the database does not become confused.

Use this interpretation:

```txt
User:
the login identity, email, password hash, role, auth tokens

Customer Account / Organization:
the business/customer workspace that owns services, billing, tickets, and deployments

Service Account / Project:
a service-specific unit such as one website deployment, one VPS, one domain, or one email hosting package
```

This means a single login can eventually manage multiple customer accounts/organizations, and each organization can own many service accounts/projects.

Do not create many separate login users just because one customer buys many services. Keep one login identity and attach services to the effective account owner.

V1 decision:

```txt
If Organization tables do not exist yet, treat User.id as the effective account owner.
Store organizationId as nullable.
Every service/payment/ticket must still have userId.
When organizationId is present, dashboard groups records under that organization.
```

V2 decision:

```txt
Add Organization and OrganizationMember.
Move account ownership/grouping to Organization.
Keep User as login identity.
Keep service records linked to both owner user and organization where possible.
```

Admin dashboard wording:

- `Customers` means login users/customer owners.
- `Accounts` means business/customer workspaces once organizations exist.
- `Services` means hosting/domain/VPS/email/deployment projects owned by a user/account.

### Phase 1

Keep `organizationId` as a nullable string on service and billing records.

Rules:

- If a real organization is available, store its ID.
- If not available, use the user's ID as the effective account owner in dashboard queries.
- Do not block implementation waiting for full organization membership tables.

### Phase 2

Add these models later when multi-account ownership is needed:

```txt
Organization
OrganizationMember
OrganizationInvite
```

Do not implement Phase 2 until the monitoring backbone works.

## User Profile Data

Keep user profile details split into safe groups:

Direct `User` fields:

```txt
name
email
phone
role
planId
accountStatus
avatarPath
idPhotoPath
```

JSON `profileDetails` may contain:

```txt
businessName
address
country
preferredCurrency
contactPerson
taxInfo
companyType
supportPreferences
```

Rules:

- Avoid putting billing provider secrets in `profileDetails`.
- Avoid putting credit card information in `profileDetails`.
- Avoid storing personal documents in JSON.
- Keep private file references in controlled fields only.

## Admin User Rules

Admin access requires:

```txt
valid JWT
User.role === "admin"
User.accountStatus === "active"
```

Admin routes must use:

```txt
authMiddleware
requireAdmin
```

Admin dashboard should read current admin from localStorage `glondia.user`, but backend authority must always come from the JWT and database.

Admin actions must not trust client-submitted admin IDs. Use `req.user.id`.

## Admin MFA Requirement

Follow `15-production-hardening.md` for MFA.

Rules:

- `super_admin`, `billing_admin`, and `security_admin` require MFA before sensitive dashboard actions.
- Destructive commands should require a recent MFA challenge once MFA is implemented.
- MFA setup, disable, and recovery must write `AuditLog`.
- Backup codes must be hashed, not stored plaintext.
- Failed MFA attempts must be rate limited.

## Customer User Rules

Customer routes require:

```txt
authMiddleware
accountStatus active
service access check when using a controlled service
```

Customers can:

- update own profile
- upload own ID photo/avatar
- buy services
- create tickets
- view own orders/receipts
- view own deployments/domains/VPS/email services

Customers cannot:

- view other users
- change `role`
- change `accountStatus`
- access admin commands
- approve receipts
- suspend/reactivate services

## Customer Onboarding Lifecycle

Follow `16-business-operations-and-reporting.md` for lifecycle tracking.

Customer lifecycle should connect identity to service activation:

```txt
registered
email_verified
profile_started
profile_complete
service_selected
checkout_started
payment_pending
payment_complete
service_provisioning
service_active
support_needed
churn_risk
cancelled
```

Rules:

- Use real backend events to update lifecycle state.
- Dashboard should show customers stuck during onboarding.
- Watchdog can flag paid users whose service never becomes active.
- Analytics can report onboarding funnel drop-off.

## User Detail Dashboard Requirement

Admin dashboard customer detail must show:

```txt
User profile
Account status
Role
Plan
Created date
Last updated date
Avatar/ID photo indicators
Billing summary
Orders
Receipts
ServiceAccess records
Deployments
Domains
VPS
Tickets
Activity timeline
Admin notes
Watchdog events
Admin commands
```

Backend endpoint:

```txt
GET /api/admin/users/:userId
```

Current endpoint already exists. Extend its response to include:

```txt
serviceAccess
tickets
watchdogEvents
adminCommands
adminNotes
activity
```

Response shape:

```json
{
  "user": {},
  "deployments": [],
  "orders": [],
  "receipts": [],
  "serviceAccess": [],
  "tickets": [],
  "watchdogEvents": [],
  "adminCommands": [],
  "adminNotes": [],
  "activity": [],
  "totals": {}
}
```

## Identity API Requirements

Existing endpoints remain:

```txt
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh-token
POST /api/v1/auth/logout
GET /api/v1/auth/me
GET /api/v1/auth/profile
PATCH /api/v1/auth/profile
POST /api/v1/auth/profile/id-photo
POST /api/v1/auth/profile/avatar
PATCH /api/v1/auth/profile/password
```

Admin user lifecycle endpoints remain:

```txt
GET /api/admin/users
GET /api/admin/users/:userId
PATCH /api/admin/users/:userId
POST /api/admin/users/:userId/suspend
POST /api/admin/users/:userId/disable
POST /api/admin/users/:userId/reactivate
POST /api/admin/users/:userId/delete
```

Required additions:

```txt
GET /api/admin/users/:userId/activity
GET /api/admin/users/:userId/services
GET /api/admin/users/:userId/tickets
GET /api/admin/users/:userId/commands
GET /api/admin/users/:userId/watchdog-events
POST /api/admin/users/:userId/notes
GET /api/admin/users/:userId/notes
```

## Implementation Steps

1. Keep current auth system.
2. Add `ServiceAccess`, `Ticket`, `AdminCommand`, `WatchdogEvent`, and `AdminNote` relations by querying user ID, not necessarily Prisma relation fields in v1.
3. Extend `adminService.getUserDetail(userId)` to include the new user-centered records.
4. Ensure all admin lifecycle actions create both `AdminCommand` and `AuditLog`.
5. Ensure suspend/disable/delete revokes refresh tokens.
6. Ensure account reactivation does not automatically reactivate deleted services unless explicitly requested.
7. Update dashboard customer drawer/page to render the expanded user detail.

## Acceptance Criteria

- A user can be viewed in admin with all related service, billing, ticket, note, command, and activity data.
- A suspended user cannot use existing valid tokens.
- A disabled/deleted user cannot access customer APIs.
- Admin user lifecycle actions are visible in both `AdminCommand` and `AuditLog`.
- No private auth or file path data leaks through user detail/list responses.
