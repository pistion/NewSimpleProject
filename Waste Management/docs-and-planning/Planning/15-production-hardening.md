# 15 - Production Hardening Implementation Plan

## Goal

Add the production controls required before real customers, real payments, and real admin power run through GlondiaSites.

This plan covers:

```txt
environment and secrets management
backup, restore, and rollback
webhook security
rate limiting and abuse protection
admin MFA / stronger login
```

These are not optional polish. They are safety rails for the full platform.

## 1. Environment And Secrets Management

Create a clear environment contract for local, staging, and production.

Required environment groups:

```txt
App:
NODE_ENV
PORT
APP_BASE_URL
CUSTOMER_APP_URL
ADMIN_DASHBOARD_URL

Database:
DATABASE_URL
SHADOW_DATABASE_URL if Prisma migrations need it

Auth:
JWT_SECRET
JWT_REFRESH_SECRET
SESSION_SECRET
PASSWORD_RESET_SECRET

Payments:
PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET
PAYPAL_WEBHOOK_ID
STRIPE_SECRET_KEY future
STRIPE_WEBHOOK_SECRET future

Providers:
RENDER_API_KEY
DOMAIN_PROVIDER_API_KEY
VPS_PROVIDER_API_KEY
EMAIL_PROVIDER_API_KEY

Email/Notifications:
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
FROM_EMAIL

Security:
ADMIN_MFA_ISSUER
ENCRYPTION_KEY
WEBHOOK_REPLAY_WINDOW_SECONDS

Observability:
LOG_LEVEL
ERROR_TRACKING_DSN optional
```

Rules:

- Never commit real `.env` files.
- Keep `.env.example` updated with variable names and safe placeholders.
- Production secrets must live in the deployment platform secret manager.
- Dashboard config/status APIs may show whether a config exists, never the secret value.
- Fail fast on missing critical production variables.
- Local development may use safe mock providers where possible.

Implementation targets:

```txt
server/src/config/env.js
server/src/config/requiredEnv.js
.env.example
```

Acceptance:

- app refuses production startup if critical secrets are missing;
- admin config page can show safe config health;
- logs never print secret values.

## 2. Backup, Restore, And Rollback

The migration plan is additive, but production still needs recovery.

Backup rules:

```txt
daily automated database backups
backup before every production migration
backup before major backfill
retain several recent backups
encrypt backups at rest
restrict restore access to super admins/operators
```

Restore rules:

```txt
restore must be tested in staging
document restore command/process
record restore test date
verify customer/service/payment counts after restore
```

Rollback rules:

```txt
schema migrations must be additive first
avoid destructive drops in early phases
feature flags/AdminPolicy can disable new behavior
backfill scripts must be idempotent
old flows must keep working during phase 1
```

Production migration checklist:

```txt
1. Create backup.
2. Verify backup exists.
3. Run schema validation.
4. Apply migration.
5. Generate Prisma client.
6. Run backfill dry-run if available.
7. Run backfill.
8. Compare row counts.
9. Smoke test customer login, checkout, dashboard, service access.
10. Keep rollback notes with deployment.
```

Acceptance:

- there is a documented backup/restore path;
- migration can be paused or rolled back by disabling new behavior;
- backfill can run twice without duplicating records.

## 3. Webhook Security

Payment and provider webhooks must be verified before updating billing or access.

Webhook rules:

```txt
verify provider signature
reject missing/invalid signatures
check event timestamp inside replay window
store provider event ID
deduplicate event ID
process idempotently
log accepted/rejected events safely
never trust client callbacks alone for paid status
```

Recommended table:

```txt
WebhookEvent
```

Fields:

```txt
id                 String   @id @default(uuid())
provider           String
providerEventId    String   @map("provider_event_id")
eventType          String   @map("event_type")
status             String   @default("received")
receivedAt         DateTime @default(now()) @map("received_at")
processedAt        DateTime? @map("processed_at")
signatureValid     Boolean  @default(false) @map("signature_valid")
idempotencyKey     String?  @map("idempotency_key")
relatedOrderId     String?  @map("related_order_id")
relatedServiceType String?  @map("related_service_type")
relatedServiceId   String?  @map("related_service_id")
errorMessage       String?  @map("error_message")
metadata           String   @default("{}")
```

Indexes:

```txt
@@unique([provider, providerEventId])
@@index([status])
@@index([receivedAt])
```

Processing states:

```txt
received
ignored
processed
failed
duplicate
invalid_signature
```

Acceptance:

- duplicate webhook does not double-activate service access;
- invalid signature does not update payment state;
- webhook failure creates safe audit/watchdog signal;
- raw webhook payload is not exposed in dashboard.

## 4. Rate Limiting And Abuse Protection

Protect public, customer, and admin routes from spam and brute force.

Rate limit groups:

```txt
auth.login:
strict by IP + email

auth.password_reset:
strict by IP + email

signup:
strict by IP

checkout:
moderate by user + IP

receipt_upload:
moderate by user

tickets:
moderate by user, stricter for new accounts

analytics:
high-volume but sampled and capped

admin_api:
moderate by admin user + IP

webhooks:
by provider IP/signature and event ID dedupe
```

Recommended middleware:

```txt
server/src/middleware/rateLimit.middleware.js
server/src/services/security/rateLimitService.js
```

Rules:

- Failed login bursts create `WatchdogEvent`.
- Repeated forbidden admin attempts create `WatchdogEvent`.
- Ticket spam should throttle creation but not block legitimate replies forever.
- Rate-limit responses should not reveal whether an email exists.
- Admin dashboard should show recent abuse/security flags.

Acceptance:

- login brute force is blocked;
- ticket spam is throttled;
- admin API mutation spam is throttled;
- rate-limit events are logged without storing secrets.

## 5. Admin MFA / Stronger Login

Admin accounts need stronger security than customer accounts.

MFA policy:

```txt
super_admin:
MFA required

billing_admin:
MFA required

security_admin:
MFA required

admin:
MFA strongly recommended; required before destructive commands

support_admin:
MFA recommended

read_only_admin:
MFA optional in v1
```

Recommended table:

```txt
AdminMfaMethod
```

Fields:

```txt
id            String   @id @default(uuid())
userId        String   @map("user_id")
methodType    String   @map("method_type")
secretRef     String?  @map("secret_ref")
enabled       Boolean  @default(false)
verifiedAt    DateTime? @map("verified_at")
lastUsedAt    DateTime? @map("last_used_at")
createdAt     DateTime @default(now()) @map("created_at")
updatedAt     DateTime @updatedAt @map("updated_at")
metadata      String   @default("{}")
```

Method types:

```txt
totp
email_otp
backup_code
passkey future
```

Rules:

- Store TOTP secrets encrypted or sealed, never plain in logs.
- Backup codes must be hashed.
- Destructive admin commands should require a recent MFA challenge for sensitive roles.
- MFA disable/reset should require super admin action and audit log.
- Failed MFA attempts should be rate limited and may create `WatchdogEvent`.

Admin API additions:

```txt
GET /api/admin/security/mfa/status
POST /api/admin/security/mfa/setup
POST /api/admin/security/mfa/verify
POST /api/admin/security/mfa/disable
POST /api/admin/security/mfa/challenge
```

Acceptance:

- super admin cannot perform sensitive actions without MFA;
- MFA setup and disable are audited;
- backup codes are not stored plaintext;
- failed MFA attempts are rate limited.

## Implementation Order

1. Add environment validation and `.env.example`.
2. Add webhook event table and idempotent webhook processing.
3. Add rate-limit middleware to auth, tickets, checkout, admin APIs.
4. Add backup/restore checklist to deployment runbook.
5. Add MFA models and admin security endpoints.
6. Add tests for all hardening features.
