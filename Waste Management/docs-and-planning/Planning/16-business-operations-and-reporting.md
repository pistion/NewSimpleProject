# 16 - Business Operations And Reporting Implementation Plan

## Goal

Add the business-facing systems that make GlondiaSites usable as a real hosting/domain/VPS/email company, not only an admin monitor.

This plan covers:

```txt
invoice, tax, and receipt documents
customer onboarding lifecycle
SLA, uptime, incidents, and customer status page
observability for operators/developers
data export and admin reporting
```

## 6. Invoice, Tax, And Receipt Documents

Orders and payments are not enough for production billing. Customers need proper billing documents.

Recommended tables:

```txt
Invoice
InvoiceLineItem
CreditNote
TaxRate
```

### Invoice

Purpose: immutable billing document issued to a customer.

Fields:

```txt
id                 String   @id @default(uuid())
invoiceNumber      String   @unique @map("invoice_number")
userId             String?  @map("user_id")
organizationId     String?  @map("organization_id")
checkoutOrderId    String?  @map("checkout_order_id")
status             String   @default("draft")
currency           String
subtotalAmount     Decimal  @map("subtotal_amount")
discountAmount     Decimal  @default(0) @map("discount_amount")
taxAmount          Decimal  @default(0) @map("tax_amount")
totalAmount        Decimal  @map("total_amount")
amountPaid         Decimal  @default(0) @map("amount_paid")
amountDue          Decimal  @default(0) @map("amount_due")
billingName        String?  @map("billing_name")
billingEmail       String?  @map("billing_email")
billingAddressJson String   @default("{}") @map("billing_address_json")
issuedAt           DateTime? @map("issued_at")
dueAt              DateTime? @map("due_at")
paidAt             DateTime? @map("paid_at")
pdfPath            String?  @map("pdf_path")
metadata           String   @default("{}")
createdAt          DateTime @default(now()) @map("created_at")
updatedAt          DateTime @updatedAt @map("updated_at")
```

Statuses:

```txt
draft | issued | paid | partially_paid | void | refunded | uncollectible
```

### InvoiceLineItem

Purpose: one row per billed product/service.

Fields:

```txt
id              String   @id @default(uuid())
invoiceId       String   @map("invoice_id")
serviceType     String?  @map("service_type")
serviceId       String?  @map("service_id")
description     String
quantity        Decimal  @default(1)
unitAmount      Decimal  @map("unit_amount")
discountAmount  Decimal  @default(0) @map("discount_amount")
taxAmount       Decimal  @default(0) @map("tax_amount")
totalAmount     Decimal  @map("total_amount")
periodStart     DateTime? @map("period_start")
periodEnd       DateTime? @map("period_end")
metadata        String   @default("{}")
```

### CreditNote

Purpose: refund, correction, or billing adjustment document.

Use for:

```txt
refunds
chargebacks
manual credits
voided invoice correction
```

### TaxRate

Purpose: configurable VAT/GST/sales tax rules.

Fields should include:

```txt
country
region
taxName
ratePercent
inclusive/exclusive
active
```

Rules:

- Invoice numbers must be sequential or consistently generated.
- Invoice billing address must snapshot the customer billing address at issue time.
- Paid invoice PDFs should be immutable.
- Refunds should create a credit note instead of rewriting the original invoice.
- Manual invoice edits require admin permission and audit logs.

Dashboard requirements:

```txt
invoice list
invoice detail
download PDF
send/resend invoice
refund/credit note view
tax summary
revenue by period
```

## 7. Customer Onboarding Lifecycle

Customers need a clear path from signup to active service.

Lifecycle states:

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

Recommended table:

```txt
CustomerLifecycle
```

Fields:

```txt
id              String   @id @default(uuid())
userId          String   @unique @map("user_id")
currentStage    String   @map("current_stage")
lastStageAt     DateTime @default(now()) @map("last_stage_at")
completedJson   String   @default("{}") @map("completed_json")
metadata        String   @default("{}")
createdAt       DateTime @default(now()) @map("created_at")
updatedAt       DateTime @updatedAt @map("updated_at")
```

Rules:

- Lifecycle updates should happen from real events, not only UI clicks.
- Email verification should be required before sensitive billing actions if possible.
- Dashboard should show customers stuck in onboarding.
- Watchdog can flag paid customers whose service never becomes active.
- Analytics can show onboarding funnel drop-off.

Customer UI guidance:

```txt
verify email
complete billing/profile
choose hosting/domain/VPS/email service
complete payment
show provisioning progress
show first support path
```

Admin dashboard requirements:

```txt
new customers today
customers stuck at payment pending
customers stuck at service provisioning
customers active after signup
customers needing support after first service
```

## 8. SLA, Uptime, Incidents, And Status Page

GlondiaSites should be able to track service health internally and eventually show customer-facing status.

Recommended tables:

```txt
ServiceHealthCheck
Incident
IncidentUpdate
MaintenanceWindow
SlaPolicy
```

ServiceHealthCheck:

```txt
serviceType
serviceId
provider
status
responseTimeMs
checkedAt
errorMessage
metadata
```

Incident:

```txt
title
status
severity
affectedServiceType
affectedServiceId
startedAt
resolvedAt
customerVisible
metadata
```

Incident statuses:

```txt
investigating | identified | monitoring | resolved
```

MaintenanceWindow:

```txt
title
scheduledStart
scheduledEnd
affectedServices
customerVisible
status
```

Rules:

- Watchdog/provider failures can create internal incidents.
- Admins decide whether an incident is customer-visible.
- Customer-facing status must not expose provider secrets or internal notes.
- Uptime/SLA reports should use health checks and incident duration, not analytics events.

Dashboard requirements:

```txt
service health overview
open incidents
recent incidents
scheduled maintenance
affected users/services
uptime by service type
```

Customer-facing future:

```txt
/status page
service status widgets in customer account
incident subscription notifications
```

## 9. Observability For Operators And Developers

Audit logs are business proof. Observability is app health.

Required observability:

```txt
structured request logs
request ID propagation
error tracking
performance metrics
job metrics
provider latency/error metrics
database query failure logging
health check endpoints
```

Implementation targets:

```txt
server/src/middleware/requestId.middleware.js
server/src/middleware/requestLogger.middleware.js
server/src/services/observability/logger.js
server/src/services/observability/metrics.js
```

Health endpoints:

```txt
GET /health
GET /health/ready
GET /api/admin/system/health
GET /api/admin/system/errors
GET /api/admin/system/metrics
```

Rules:

- Logs must include request ID.
- Errors should include safe context, not secrets.
- Admin dashboard can show system health summaries.
- Developer/operator logs are separate from customer-facing audit history.
- Critical app errors can create admin notifications or watchdog events.

Metrics to track:

```txt
request count
request latency
error rate
login failures
checkout failures
webhook failures
provider sync failures
job duration
database errors
service access denials
```

## 10. Data Export And Admin Reporting

Admins will need reports for billing, customers, services, audit, and support.

Recommended table:

```txt
ExportJob
```

Fields:

```txt
id              String   @id @default(uuid())
requestedById   String?  @map("requested_by_id")
exportType      String   @map("export_type")
status          String   @default("queued")
filtersJson     String   @default("{}") @map("filters_json")
filePath        String?  @map("file_path")
rowCount        Int?     @map("row_count")
errorMessage    String?  @map("error_message")
createdAt       DateTime @default(now()) @map("created_at")
completedAt     DateTime? @map("completed_at")
expiresAt       DateTime? @map("expires_at")
metadata        String   @default("{}")
```

Export types:

```txt
customers
services
billing_orders
invoices
payments
discount_redemptions
tickets
watchdog_events
audit_logs
analytics_summary
provider_sync_runs
```

Rules:

- Exports require admin permission.
- Sensitive exports require super_admin or role-specific permission.
- Export files should expire.
- Export generation should run as a background job for large datasets.
- Export filters must be recorded for audit.
- Exports must scrub secrets and raw private paths.

Dashboard requirements:

```txt
Reports page
export CSV
export date range
export filtered table
download recent exports
show export status
audit who exported what
```

## Implementation Order

1. Add invoice/tax/credit note models or document delayed implementation.
2. Add lifecycle tracking from auth, profile, checkout, and service events.
3. Add service health checks and incident models.
4. Add request IDs, structured logs, and health endpoints.
5. Add export job model and admin report endpoints.
6. Add dashboard screens/widgets for billing docs, onboarding, health, system, and reports.
7. Add acceptance tests.
