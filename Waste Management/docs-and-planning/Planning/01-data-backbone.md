# 01 - Data Backbone Implementation Plan

## Goal

Create the production database foundation for the GlondiaSites admin monitoring system. The database must become the source of truth for users, billing, services, access state, admin actions, customer support, monitoring, and dashboard history.

The dashboard should not guess from scattered data. It should read from clear records that connect every user to every service, payment, activity, and admin decision.

## Current State

The current Prisma schema already includes important base tables:

- `User`
- `Notification`
- `RefreshToken`
- `VpsService`
- `VpsActionLog`
- `WebHostingService`
- `BusinessService`
- `CheckoutOrder`
- `DeploymentSubscription`
- `PaymentReceipt`
- `DeploymentCleanupJob`
- `AuditLog`

The current admin backend also reads deployments from the JSON hosting store via `readHostingStore()`. This means deployment data currently lives partly outside Prisma. The implementation must not break existing deployment flows, but should begin creating normalized records that the admin dashboard can rely on.

## Required New Tables

Add these Prisma models:

```txt
ServiceAccess
AdminPolicy
AdminCommand
Ticket
TicketMessage
WatchdogEvent
AnalyticsEvent
AdminNote
DashboardSession
PaymentMethod
DiscountCode
DiscountRedemption
ProviderIntegration
ProviderSyncRun
ScheduledJobRun
NotificationPreference
RetentionPolicy
WebhookEvent
AdminMfaMethod
Invoice
InvoiceLineItem
CreditNote
TaxRate
CustomerLifecycle
ServiceHealthCheck
Incident
IncidentUpdate
MaintenanceWindow
SlaPolicy
ExportJob
CrmEmailList
CrmEmailListMember
CrmAiSession
ChatbotInteraction
ChatbotKnowledgeEntry
```

These tables should not replace existing tables immediately. They should sit beside the current schema and become the monitoring/control backbone.

## Diagram-To-Database Mapping

The user diagram separates the platform into data zones. Preserve that separation in the implementation:

```txt
User data:
basic profile, billing profile, service usage, complaints, service history, account status, password hashes only

Instruction data:
admin power policies, service toggle rules, watchdog rules, analytics collection rules

Service toggle layer:
monthly access pass records, active/dead service state, admin blocks, subscription expiry, session/access state

Customer services layer:
tickets, billing questions, hosting/domain/VPS/email complaints, customer/admin conversations, chatbot records

Dashboard data:
admin sessions, dashboard-only notes, email lists, AI/chat sessions, admin-only reporting state
```

Do not mix these into one catch-all table. Each zone should be queryable by the admin dashboard, but customer APIs should only expose the customer-owned records they are allowed to see.

Payment and discount data belongs in the billing zone:

```txt
PaymentMethod:
safe provider references only, never raw card numbers or CVV

DiscountCode:
admin-created coupon/discount rules

DiscountRedemption:
records when a user/order/service uses a discount
```

## Table: ServiceAccess

Purpose: one row per user-owned service instance that decides whether the user can access that service.

This is the most important new table.

Treat this row as the monthly access pass for a service. It is not a public bearer token and should not be sent around like a password. It is the database record the middleware checks to decide whether the user can use a hosting, VPS, domain, email, or deployment feature.

Fields:

```txt
id                 String   @id @default(uuid())
userId             String?  @map("user_id")
organizationId     String?  @map("organization_id")
serviceType        String   @map("service_type")
serviceId          String   @map("service_id")
serviceName        String?  @map("service_name")
accessStatus       String   @default("pending") @map("access_status")
billingStatus      String   @default("pending") @map("billing_status")
adminStatus        String   @default("allowed") @map("admin_status")
planId             String?  @map("plan_id")
checkoutOrderId    String?  @map("checkout_order_id")
subscriptionId      String?  @map("subscription_id")
startsAt           DateTime? @map("starts_at")
expiresAt          DateTime? @map("expires_at")
lastCheckedAt      DateTime? @map("last_checked_at")
lastActivityAt     DateTime? @map("last_activity_at")
suspendedAt        DateTime? @map("suspended_at")
suspendedReason    String?  @map("suspended_reason")
metadata           String   @default("{}")
createdAt          DateTime @default(now()) @map("created_at")
updatedAt          DateTime @updatedAt @map("updated_at")
```

Indexes:

```txt
@@unique([serviceType, serviceId])
@@index([userId, serviceType])
@@index([organizationId, serviceType])
@@index([accessStatus])
@@index([billingStatus])
@@index([adminStatus])
@@index([expiresAt])
@@map("service_access")
```

Allowed values:

```txt
serviceType:
hosting | domain | vps | email | builder | support | other

accessStatus:
pending | active | suspended | expired | cancelled | deleted

billingStatus:
trial | pending | paid | overdue | failed | cancelled | free

adminStatus:
allowed | blocked | review_required
```

Rules:

- Every paid or controlled service must have one `ServiceAccess` row.
- A service is usable only when `accessStatus = active`, `adminStatus = allowed`, and billing is acceptable.
- Billing acceptable means `billingStatus` is `paid`, `trial`, or `free`.
- Admin status overrides billing. If `adminStatus = blocked`, the service must be blocked even if paid.
- Expired services must be marked `expired` or `overdue` by background enforcement.
- Do not hard delete access records. Preserve history.

## Table: AdminPolicy

Purpose: store the instruction data that controls admin power, service toggles, watchdog behavior, and analytics collection.

This table captures the yellow instruction-data block from the diagram. These records are not service records. They are database-controlled rules that other services read before acting.

Fields:

```txt
id               String   @id @default(uuid())
policyKey        String   @unique @map("policy_key")
category         String
enabled          Boolean  @default(true)
valueJson        String   @default("{}") @map("value_json")
description      String?
updatedByAdminId String?  @map("updated_by_admin_id")
createdAt        DateTime @default(now()) @map("created_at")
updatedAt        DateTime @updatedAt @map("updated_at")
```

Allowed categories:

```txt
admin_power
service_toggle
watchdog
analytics
dashboard
crm
```

Examples:

```txt
service.hosting.require_paid_access
service.vps.auto_suspend_on_expiry
watchdog.detect_repeated_failed_payments
watchdog.detect_suspicious_admin_activity
analytics.collect_click_events
analytics.collect_scroll_summary
crm.enable_ai_chat_sessions
```

Rules:

- Code must read `AdminPolicy` before enabling optional monitoring or automation behavior.
- Policies can enable, disable, or configure behavior, but they should not directly execute destructive work.
- Any policy update must create an `AuditLog` row.
- Only admins can update policies.
- Customer APIs must never expose internal policy values.

## Table: AdminCommand

Purpose: store every admin power action as an auditable command.

Fields:

```txt
id                String   @id @default(uuid())
adminUserId       String?  @map("admin_user_id")
targetUserId      String?  @map("target_user_id")
targetServiceType String?  @map("target_service_type")
targetServiceId   String?  @map("target_service_id")
commandType       String   @map("command_type")
reason            String?
beforeState       String   @default("{}") @map("before_state")
afterState        String   @default("{}") @map("after_state")
status            String   @default("completed")
errorMessage      String?  @map("error_message")
metadata          String   @default("{}")
createdAt         DateTime @default(now()) @map("created_at")
```

Indexes:

```txt
@@index([adminUserId, createdAt])
@@index([targetUserId, createdAt])
@@index([targetServiceType, targetServiceId])
@@index([commandType, createdAt])
@@index([status, createdAt])
@@map("admin_commands")
```

Allowed command types:

```txt
SUSPEND_USER
REACTIVATE_USER
DISABLE_USER
DELETE_USER
SUSPEND_SERVICE
REACTIVATE_SERVICE
CANCEL_SERVICE
APPROVE_RECEIPT
REJECT_RECEIPT
MARK_DEPLOYMENT_PAID
FORCE_REDEPLOY
APPLY_DISCOUNT
FLAG_SECURITY_REVIEW
```

Rules:

- Admin commands must be created for every destructive or access-changing admin action.
- Existing `AuditLog` must still be written.
- `AdminCommand` stores the admin intent and before/after state.
- `AuditLog` stores the system event history.

## Table: Ticket

Purpose: customer support, complaints, service requests, billing questions, and admin/customer communication.

Fields:

```txt
id             String   @id @default(uuid())
userId         String?  @map("user_id")
organizationId String?  @map("organization_id")
category       String   @default("general")
priority       String   @default("normal")
status         String   @default("open")
subject        String
relatedServiceType String? @map("related_service_type")
relatedServiceId   String? @map("related_service_id")
assignedAdminId    String? @map("assigned_admin_id")
metadata       String   @default("{}")
closedAt       DateTime? @map("closed_at")
createdAt      DateTime @default(now()) @map("created_at")
updatedAt      DateTime @updatedAt @map("updated_at")
```

Indexes:

```txt
@@index([userId, createdAt])
@@index([organizationId, createdAt])
@@index([status, priority])
@@index([category, createdAt])
@@index([relatedServiceType, relatedServiceId])
@@map("tickets")
```

Allowed values:

```txt
category:
billing | hosting | domain | vps | email | account | complaint | general

priority:
low | normal | high | urgent

status:
open | pending_admin | pending_customer | resolved | closed
```

## Table: TicketMessage

Purpose: conversation messages inside a ticket.

Fields:

```txt
id                  String   @id @default(uuid())
ticketId            String   @map("ticket_id")
senderUserId        String?  @map("sender_user_id")
senderRole          String   @map("sender_role")
body                String
attachmentsMetadata String   @default("{}") @map("attachments_metadata")
metadata            String   @default("{}")
createdAt           DateTime @default(now()) @map("created_at")
```

Indexes:

```txt
@@index([ticketId, createdAt])
@@index([senderUserId, createdAt])
@@map("ticket_messages")
```

Allowed sender roles:

```txt
customer | admin | system
```

## Table: WatchdogEvent

Purpose: monitoring, suspicious activity, failures, and admin review queue.

Fields:

```txt
id                 String   @id @default(uuid())
userId             String?  @map("user_id")
organizationId     String?  @map("organization_id")
serviceType        String?  @map("service_type")
serviceId          String?  @map("service_id")
eventType          String   @map("event_type")
severity           String   @default("info")
status             String   @default("open")
message            String
metadata           String   @default("{}")
reviewedByAdminId  String?  @map("reviewed_by_admin_id")
reviewedAt         DateTime? @map("reviewed_at")
createdAt          DateTime @default(now()) @map("created_at")
```

Indexes:

```txt
@@index([userId, createdAt])
@@index([serviceType, serviceId])
@@index([eventType, createdAt])
@@index([severity, status])
@@map("watchdog_events")
```

Allowed values:

```txt
severity:
info | warning | danger | critical

status:
open | reviewed | dismissed | escalated
```

## Table: AnalyticsEvent

Purpose: non-security tracking for usage, dashboard reports, conversions, service use, and product analytics.

Fields:

```txt
id             String   @id @default(uuid())
userId         String?  @map("user_id")
organizationId String? @map("organization_id")
sessionId      String? @map("session_id")
eventType      String @map("event_type")
entityType     String? @map("entity_type")
entityId       String? @map("entity_id")
path           String?
metadata       String @default("{}")
createdAt      DateTime @default(now()) @map("created_at")
```

Indexes:

```txt
@@index([userId, createdAt])
@@index([organizationId, createdAt])
@@index([eventType, createdAt])
@@index([entityType, entityId])
@@map("analytics_events")
```

Rules:

- Analytics should not decide service access.
- Analytics should not contain raw secrets, payment data, passwords, or private files.
- Analytics can power dashboard reports and customer journey tracking.

## Table: AdminNote

Purpose: private admin notes on users, tickets, services, payments, or incidents.

Fields:

```txt
id             String   @id @default(uuid())
adminUserId    String?  @map("admin_user_id")
targetUserId   String?  @map("target_user_id")
entityType     String?  @map("entity_type")
entityId       String?  @map("entity_id")
body           String
metadata       String   @default("{}")
createdAt      DateTime @default(now()) @map("created_at")
updatedAt      DateTime @updatedAt @map("updated_at")
```

Indexes:

```txt
@@index([targetUserId, createdAt])
@@index([entityType, entityId])
@@index([adminUserId, createdAt])
@@map("admin_notes")
```

## Table: DashboardSession

Purpose: track admin dashboard sessions and admin dashboard usage.

Fields:

```txt
id             String   @id @default(uuid())
adminUserId    String?  @map("admin_user_id")
sessionTokenId String?  @map("session_token_id")
ipAddress      String?  @map("ip_address")
userAgent      String?  @map("user_agent")
startedAt      DateTime @default(now()) @map("started_at")
endedAt        DateTime? @map("ended_at")
lastSeenAt     DateTime? @map("last_seen_at")
metadata       String   @default("{}")
```

Indexes:

```txt
@@index([adminUserId, startedAt])
@@index([lastSeenAt])
@@map("dashboard_sessions")
```

## CRM And Dashboard-Only Data Tables

After the base ticket flow works, add these tables to capture the dashboard-data block from the diagram:

```txt
CrmEmailList
CrmEmailListMember
CrmAiSession
ChatbotInteraction
ChatbotKnowledgeEntry
```

Purpose:

- `CrmEmailList` stores admin-managed customer email groups such as billing notices, hosting updates, launch customers, or VPS customers.
- `CrmEmailListMember` connects users or external contacts to those lists.
- `CrmAiSession` stores admin/customer AI-assistance sessions that belong to the dashboard or CRM.
- `ChatbotInteraction` stores customer questions, bot answers, escalation state, and linked ticket/user/service references.
- `ChatbotKnowledgeEntry` stores approved training/help entries for the GlondiaSites chatbot.

Rules:

- These records are dashboard/CRM records, not service-access records.
- Email lists must respect opt-out/unsubscribe rules.
- Chatbot training entries must be admin-approved before they influence customer answers.
- AI/chat records must not store passwords, card numbers, CVV, private keys, or raw secrets.
- Link back to `User`, `Ticket`, and `ServiceAccess` when the conversation is about a known customer or service.

## Backfill Requirements

Create a script:

```txt
scripts/backfill-service-access.mjs
```

It must read existing data and create `ServiceAccess` rows.

Backfill sources:

- Hosting deployments from JSON hosting store
- `VpsService`
- `BusinessService`
- `WebHostingService`
- `DeploymentSubscription`
- `CheckoutOrder`

Mapping rules:

- Deployment from hosting store becomes `serviceType = hosting`, `serviceId = deploymentId`.
- `VpsService` becomes `serviceType = vps`, `serviceId = VpsService.id`.
- `BusinessService` with `type = domain` becomes `serviceType = domain`.
- `BusinessService` with `type = email` becomes `serviceType = email`.
- If payment is paid, set `billingStatus = paid`.
- If service is live/deployed/active, set `accessStatus = active`.
- If service is suspended, set `accessStatus = suspended`.
- If service is deleted/account_deleted/cancelled, set `accessStatus = cancelled` or `deleted`.
- If no matching user exists, keep `userId = null` but preserve service record.

The script must be idempotent. Running it multiple times should update existing rows, not duplicate them.

## Backend Acceptance Criteria

- Prisma validates.
- All new tables exist.
- Existing auth, admin, billing, and deployment flows still work.
- Backfill creates one access row per existing service.
- Admin dashboard can query service access records without reading scattered service-specific data first.
- No raw passwords, token secrets, full credit cards, raw receipt file paths, raw ID photo paths, or private file paths are exposed through public/admin list APIs.
