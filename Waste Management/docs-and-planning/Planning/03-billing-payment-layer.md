# 03 - Billing And Payment Layer Implementation Plan

## Goal

Make billing production-safe and dashboard-visible. The admin dashboard must clearly show who paid, who has pending payment, what receipt needs review, what service is overdue, and what service access should be active or blocked.

The billing layer must never store raw credit card details.

## Current State

The current schema already includes:

- `CheckoutOrder`
- `PaymentReceipt`
- `DeploymentSubscription`
- payment status on service records
- PayPal provider routes/services
- manual receipt approval/rejection
- admin actions for marking deployments paid

The current implementation is already strong for deploy-first hosting billing, but it needs to connect to the new `ServiceAccess` table so service access is not inferred from scattered fields.

## Payment Provider Strategy

Use a provider-adapter model so billing can support PayPal, manual receipt payments, and a future card provider such as Stripe without rewriting service access logic.

Provider layers:

```txt
PaymentIntent/Checkout creation:
creates a provider checkout/order/session and a local CheckoutOrder

Payment confirmation:
webhook, provider callback, or admin receipt approval marks the order paid

Payment failure:
webhook/callback/manual rejection marks payment failed or pending

Renewal:
provider subscription event or scheduled manual renewal extends ServiceAccess.expiresAt

Refund/chargeback:
provider event updates billing state and may mark ServiceAccess review_required or suspended
```

V1 providers:

```txt
PayPal:
keep existing PayPal flow and map it into the standard order/payment status model

Manual receipt:
keep existing upload/review flow and map approval/rejection into ServiceAccess
```

V2 provider:

```txt
Stripe or another card processor:
add only through a provider adapter and hosted checkout/payment method collection
```

Do not let service modules call PayPal/Stripe directly. Service modules should only care whether `ServiceAccess` says the user can use the service.

### Provider Adapter Interface

Create a consistent service boundary:

```txt
server/src/services/payments/paymentProviderRegistry.js
server/src/services/payments/providers/paypalProvider.js
server/src/services/payments/providers/manualReceiptProvider.js
server/src/services/payments/providers/stripeProvider.js (future)
```

Common functions:

```js
async function createCheckout(input)
async function verifyWebhook(input)
async function capturePayment(input)
async function refundPayment(input)
async function getPaymentStatus(input)
async function syncCustomerPaymentMethod(input)
```

Common normalized provider result:

```txt
provider
providerOrderId
providerPaymentId
providerCustomerId
providerPaymentMethodId
status
amount
currency
paidAt
failureCode
failureMessage
rawEventReference
```

Store raw webhook bodies only if needed for signature verification and retention policy allows it. Do not expose raw provider payloads in dashboard list APIs.

### Webhook Security Requirements

Implement webhook handling according to `15-production-hardening.md`.

Billing webhooks must:

- verify provider signature before processing;
- reject replayed/stale events;
- dedupe by provider event ID;
- write `WebhookEvent`;
- process idempotently so duplicate provider events do not double-charge or double-activate `ServiceAccess`;
- write `AuditLog` for important accepted payment changes;
- create `WatchdogEvent` for repeated webhook failures.

Never mark a payment as paid from a browser redirect alone. Browser redirects can update UI state, but provider webhook/capture verification must be the billing source of truth.

## Safe Payment Data Rules

Never store:

```txt
full card number
CVV
raw bank credentials
raw PayPal secrets
payment provider access tokens in normal tables
```

Allowed to store:

```txt
provider name
provider customer ID
provider payment method ID
card brand
card last4
expiry month/year if provider allows it
billing name
billing email
billing address
payment status
receipt file metadata
```

If Stripe or another card provider is added later, create a `PaymentMethod` table that stores provider tokens only.

## Card And PCI Security Policy

The system must not become a raw credit card vault.

Production rule:

```txt
Use hosted payment pages or provider-hosted card collection.
Never send full card numbers through the GlondiaSites backend unless the business intentionally builds PCI-compliant card infrastructure.
Never store CVV under any circumstance.
Never log payment form bodies.
Never expose provider secrets, payment method IDs, or customer IDs to customer-facing JavaScript unless the provider explicitly requires a publishable token.
```

Allowed local card display data:

```txt
card brand
last4
expiry month/year
billing name/email/address
provider customer ID
provider payment method ID
default payment method flag
payment method status
```

Dashboard display:

```txt
Visa ending 4242
expires 08/2028
default method yes/no
provider Stripe/PayPal/manual
status active/expired/failed/removed
```

Dashboard must never show:

```txt
full card number
CVV
provider access token
private webhook secret
raw authorization headers
```

## Existing Billing Tables To Keep

Keep `CheckoutOrder`.

Purpose:

- records an attempted or completed purchase
- stores provider order/capture IDs
- connects payment to deployment/service
- stores total customer price
- stores due date and paid date

Keep `PaymentReceipt`.

Purpose:

- stores manual bank transfer proof metadata
- admin approves or rejects
- approval marks linked order/service as paid

Keep `DeploymentSubscription`.

Purpose:

- tracks deployment billing periods and renewal dates
- supports monthly hosting renewal logic

## Recommended New Table: PaymentMethod

Add only if customer cards or reusable payment methods are being implemented now.

If not implementing card storage yet, document this table but delay implementation.

Fields:

```txt
id                      String   @id @default(uuid())
userId                  String?  @map("user_id")
organizationId          String?  @map("organization_id")
provider                String
providerCustomerId      String?  @map("provider_customer_id")
providerPaymentMethodId String?  @map("provider_payment_method_id")
brand                   String?
last4                   String?
expMonth                Int?     @map("exp_month")
expYear                 Int?     @map("exp_year")
billingName             String?  @map("billing_name")
billingEmail            String?  @map("billing_email")
status                  String   @default("active")
isDefault               Boolean  @default(false) @map("is_default")
metadata                String   @default("{}")
createdAt               DateTime @default(now()) @map("created_at")
updatedAt               DateTime @updatedAt @map("updated_at")
```

Indexes:

```txt
@@index([userId])
@@index([organizationId])
@@index([provider, providerCustomerId])
@@map("payment_methods")
```

Allowed statuses:

```txt
active | expired | failed | removed
```

## Recommended New Tables: Discounts And Coupons

The diagram mentions discounts, admin revokes, memberships, and how long coupons can last. Model that explicitly instead of hiding it in random metadata.

Add these when discounts are implemented:

```txt
DiscountCode
DiscountRedemption
```

### DiscountCode

Purpose: admin-created coupon/discount rule.

Fields:

```txt
id                  String   @id @default(uuid())
code                String   @unique
name                String?
description         String?
discountType        String   @map("discount_type")
discountValue       Decimal  @map("discount_value")
currency            String?
scope               String   @default("all")
serviceType         String?  @map("service_type")
planId              String?  @map("plan_id")
maxRedemptions      Int?     @map("max_redemptions")
maxPerUser          Int?     @map("max_per_user")
startsAt            DateTime? @map("starts_at")
expiresAt           DateTime? @map("expires_at")
durationType        String   @default("once") @map("duration_type")
durationMonths      Int?     @map("duration_months")
status              String   @default("active")
createdByAdminId    String?  @map("created_by_admin_id")
metadata            String   @default("{}")
createdAt           DateTime @default(now()) @map("created_at")
updatedAt           DateTime @updatedAt @map("updated_at")
```

Allowed values:

```txt
discountType:
percent | fixed_amount | free_trial | service_credit

scope:
all | hosting | domain | vps | email | builder | plan | user_specific

durationType:
once | repeating | forever | trial_period

status:
active | paused | expired | revoked
```

### DiscountRedemption

Purpose: record each use of a discount.

Fields:

```txt
id              String   @id @default(uuid())
discountCodeId  String   @map("discount_code_id")
userId          String?  @map("user_id")
organizationId  String?  @map("organization_id")
checkoutOrderId String?  @map("checkout_order_id")
serviceType     String?  @map("service_type")
serviceId       String?  @map("service_id")
amountDiscounted Decimal? @map("amount_discounted")
currency        String?
status          String   @default("applied")
appliedAt       DateTime @default(now()) @map("applied_at")
revokedAt       DateTime? @map("revoked_at")
metadata        String   @default("{}")
```

Allowed statuses:

```txt
applied | consumed | revoked | refunded
```

Rules:

- Discount validation happens before checkout completion.
- A discount must never override `adminStatus = blocked`.
- Expired/revoked discounts cannot create new redemptions.
- Existing redemptions must remain for audit/history.
- Admin applying or revoking a discount must create `AdminCommand` and `AuditLog`.
- Discount duration affects billing amount, not service access by itself.
- Service access is still controlled by payment result plus `ServiceAccess`.

Dashboard requirements:

```txt
list discount codes
show active/expired/revoked
show redemption count
show users/orders/services affected
allow admin revoke/pause with reason
show discount impact on revenue
```

## Billing Status Model

Use the same billing status language everywhere:

```txt
trial
pending
payment_uploaded
paid
overdue
failed
cancelled
refunded
free
```

Map old values into this standard where possible.

## Invoice, Tax, And Receipt Documents

Follow `16-business-operations-and-reporting.md` for production billing documents.

Billing should eventually generate:

```txt
Invoice
InvoiceLineItem
CreditNote
TaxRate
downloadable invoice/receipt PDF
tax summary reports
```

Rules:

- Checkout/payment records prove transactions.
- Invoices are customer-facing billing documents.
- Refunds/chargebacks create credit notes rather than rewriting paid invoices.
- Invoice billing address should snapshot customer billing details at issue time.
- Invoice PDFs must not expose private internal metadata.

## Payment To ServiceAccess Sync

Every payment update must sync `ServiceAccess`.

Payment success:

```txt
CheckoutOrder.status = paid
CheckoutOrder.paidAt = now
PaymentReceipt.status = approved if manual receipt
ServiceAccess.billingStatus = paid
ServiceAccess.accessStatus = active
ServiceAccess.lastCheckedAt = now
AuditLog: billing.payment_paid
```

Payment pending:

```txt
CheckoutOrder.status = pending
ServiceAccess.billingStatus = pending
ServiceAccess.accessStatus = pending or active if grace/trial allowed
```

Receipt uploaded:

```txt
CheckoutOrder.status = payment_uploaded
PaymentReceipt.status = pending
ServiceAccess.billingStatus = pending
ServiceAccess.accessStatus remains pending or trial
Admin notification created
```

Receipt rejected:

```txt
PaymentReceipt.status = rejected
CheckoutOrder.status = pending
ServiceAccess.billingStatus = pending
ServiceAccess.accessStatus depends on grace/trial
User notification created
```

Overdue:

```txt
ServiceAccess.billingStatus = overdue
ServiceAccess.accessStatus = suspended or expired
Deployment/service can be suspended by enforcement job
WatchdogEvent created
```

## Admin Billing Actions

Admin billing actions must create `AdminCommand`, `AuditLog`, and user notification when relevant.

Actions:

```txt
APPROVE_RECEIPT
REJECT_RECEIPT
MARK_DEPLOYMENT_PAID
CREATE_MANUAL_RENEWAL
APPLY_DISCOUNT
REVOKE_DISCOUNT
CANCEL_ORDER
REFUND_PAYMENT
MARK_CHARGEBACK
```

Existing functions to wrap:

```txt
approveReceipt
rejectReceipt
adminMarkDeploymentPaid
adminRenewDeploymentManually
deleteOrder
```

Each wrapper must capture:

```txt
beforeState
afterState
adminUserId
targetUserId
targetServiceType
targetServiceId
reason
```

## Billing Dashboard Requirements

Admin dashboard Billing tab should show:

```txt
total revenue
pending orders
paid orders
payment uploaded orders
overdue services
receipts pending review
failed payment count
recent billing activity
```

Billing row should show:

```txt
order ID
user name/email
service type
service ID/name
amount
currency
provider
status
createdAt
paidAt
dueAt
receipt status
admin actions
```

Customer detail billing section should show:

```txt
billing profile
payment methods safe metadata
orders
receipts
subscriptions
overdue services
discounts/admin commands
```

## API Requirements

Customer APIs:

```txt
GET /api/v1/billing/profile
PATCH /api/v1/billing/profile
GET /api/v1/billing/orders
GET /api/v1/billing/receipts
POST /api/v1/billing/receipts
GET /api/v1/billing/payment-methods
POST /api/v1/billing/payment-methods
DELETE /api/v1/billing/payment-methods/:id
```

Admin APIs:

```txt
GET /api/admin/orders
GET /api/admin/receipts
POST /api/admin/receipts/:receiptId/approve
POST /api/admin/receipts/:receiptId/reject
POST /api/admin/deployments/:deploymentId/mark-paid
POST /api/admin/deployments/:deploymentId/renew-manually
POST /api/admin/orders/:orderId/delete
GET /api/admin/billing/summary
GET /api/admin/billing/overdue-services
```

Existing endpoints can be extended rather than duplicated.

## Implementation Steps

1. Add `PaymentMethod` only if reusable card/payment-method UI is in scope now.
2. Add helper `syncServiceAccessFromOrder(orderId)`.
3. Add helper `syncServiceAccessFromReceipt(receiptId)`.
4. Update receipt approval/rejection to sync access state.
5. Update PayPal capture/webhook flow to sync access state.
6. Update manual mark-paid and manual renewal to sync access state.
7. Add admin billing summary endpoint.
8. Add dashboard billing cards and overdue service list.
9. Add tests for payment-to-access transitions.

## Acceptance Criteria

- Paying for hosting makes matching `ServiceAccess` active and paid.
- Receipt approval makes matching service active and paid.
- Receipt rejection does not activate service.
- Overdue service is visible in admin dashboard.
- Billing rows show user ownership.
- Admin billing actions are recorded as `AdminCommand` and `AuditLog`.
- No raw card details are stored or exposed.
