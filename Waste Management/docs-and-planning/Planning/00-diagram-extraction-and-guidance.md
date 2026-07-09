# 00 - Diagram Extraction And Implementation Guidance

## Purpose

This file translates the user's diagram into a clean production implementation guide.

Treat this document as the bridge between the hand-drawn architecture and the detailed plans in `01` through `14`.

The diagram describes a GlondiaSites platform where:

- customers use the main website to create accounts, buy services, submit billing/payment details, and use hosting/domain/VPS/email services;
- payment middleware creates or renews access passes;
- service modules do only their own business logic;
- the database is the source of truth for users, services, access, instructions, tickets, analytics, and dashboard data;
- the admin dashboard monitors users, services, payments, tickets, activity, and system health;
- admin power is executed through database-controlled instruction records and audited commands, not random direct script calls.

## High-Level System Flow

```txt
Customer / visitor
-> main website account and service flow
-> payment and access-pass middleware
-> service-specific controllers
-> database source of truth
-> admin instruction / policy layer
-> admin dashboard monitoring and control
```

In production, every major action should leave a useful record:

```txt
customer signs up -> User + AuditLog + AnalyticsEvent
customer pays -> CheckoutOrder/PaymentReceipt + ServiceAccess
customer deploys -> service record + ServiceAccess + AnalyticsEvent
customer asks for help -> Ticket + TicketMessage
admin suspends service -> AdminCommand + ServiceAccess update + AuditLog
watchdog detects risk -> WatchdogEvent + Notification
admin opens dashboard -> DashboardSession + AnalyticsEvent
```

## Diagram Objects And Production Meaning

### Black Start Circle

Diagram meaning:

```txt
user/customer starts the flow
```

Production meaning:

- anonymous visitor;
- registered customer;
- authenticated user;
- account owner;
- later, organization/team member if multi-account ownership is added.

Implementation target:

- use the existing `User` model;
- extend it carefully for account status, billing profile references, customer metadata, and service ownership;
- never store plaintext passwords;
- never store full credit card details.

### Orange Box: Account / Entry Phase

Diagram meaning:

```txt
customer enters the system, creates account, fills details, begins using the website
```

Production meaning:

- signup;
- login;
- account profile;
- service selection;
- checkout start;
- first user metadata capture.

Implementation target:

- keep auth in the main site;
- dashboard should not be the customer account creator;
- dashboard reads and manages customer records after they exist;
- all customer actions should connect back to `User.id`.

Related plans:

- `02-identity-account-organization.md`
- `03-billing-payment-layer.md`
- `10-analytics-layer.md`

### Payment Check Box / Red Circle

Diagram meaning:

```txt
payment checks happen here
middleware payment passes through
tokens/access passes are generated for users who pay
token/access pass lasts about a month
```

Production meaning:

- checkout and receipt/payment approval;
- subscription renewal;
- monthly access window;
- billing status;
- access status;
- failed payment handling;
- grace periods if desired.

Implementation target:

- use payment provider tokens only through the payment provider;
- store only provider references, last4/brand/expiry where legally safe, and billing status;
- use PayPal/manual receipt adapters first, and add card processors later through hosted checkout;
- never store full card numbers or CVV;
- model coupons/discounts as billing records, not hidden service flags;
- use `ServiceAccess` as the internal monthly access pass;
- do not invent a public reusable service token unless a downstream provider requires it;
- access expires by `expiresAt`;
- access renews when payment succeeds;
- unpaid services become `overdue`, `expired`, or `suspended`.

Related plans:

- `03-billing-payment-layer.md`
- `04-service-access-gate.md`
- `13-migration-backfill.md`

### Colored Service Blocks

Diagram meaning:

```txt
services are strict business logic/controllers
no model layer inside service blocks
each service has one job
services check middleware to know if user is allowed
payment status is stored in database
```

Production meaning:

- hosting service;
- VPS service;
- domain service;
- email service;
- builder/deployment service;
- future support services.

Implementation target:

- each service module should stay focused on business work;
- do not let service controllers decide billing by themselves;
- service controllers call `serviceAccessService.ensureServiceAccess(...)`;
- service controllers write service records and activity records;
- service controllers should not bypass admin blocks;
- service-specific records remain detailed, while `ServiceAccess` is the cross-service control row.

Related plans:

- `04-service-access-gate.md`
- `05-service-records.md`
- `12-backend-apis.md`

### Pink Box: Database Layer

Diagram meaning:

```txt
database layer handles models, SQL, insert/update/edit
stores accounts, billing info, card/payment info, storage data, account status
stores service enable/disable state
users can update normal user data
admin can access/manage all
services bought and active are tagged and recorded
records and instruction data are separate
instructions can block/restrict/discount services
```

Production meaning:

The database is split into zones:

```txt
User records
Billing/payment records
Service records
Service access/toggle records
Instruction/policy records
Admin command/audit records
Ticket/CRM records
Analytics/watchdog records
Dashboard-only records
```

Implementation target:

- normalize the data so dashboard queries are reliable;
- keep user data separate from instruction data;
- keep dashboard-only data in its own tables;
- keep audit/proof separate from analytics;
- never store plaintext passwords;
- never store CVV;
- avoid raw card storage unless PCI-compliant infrastructure exists;
- keep admin-only data behind `requireAdmin`.

Related plans:

- `01-data-backbone.md`
- `07-activity-audit-logging.md`
- `13-migration-backfill.md`

### Brown Box: Admin Instruction / Server Script Layer

Diagram meaning:

```txt
admin ability lives here
instructions/server scripts are covered with middleware
outside info only listens to database instruction section
does not record services directly
does not do anything until database variables enable it
triggered by API calls, text commands, keywords, toggles, or admin-only instructions
```

Production meaning:

- admin commands;
- admin policy toggles;
- service enable/disable rules;
- discount/revoke rules;
- watchdog scan rules;
- analytics collection rules;
- controlled background jobs.

Implementation target:

- use `AdminPolicy` for configuration/instruction data;
- use `AdminCommand` for executed admin actions;
- use `AuditLog` for proof;
- do not let scripts run destructive actions without a database command/policy and admin audit;
- every admin power action must be traceable to an admin user, reason, target, before state, and after state;
- background jobs read database policies before doing optional behavior.

Related plans:

- `06-admin-command-layer.md`
- `07-activity-audit-logging.md`
- `09-watchdog-security-monitoring.md`
- `12-backend-apis.md`

### Yellow Admin Dashboard Box

Diagram meaning:

```txt
admin dashboard is in charge of oversight, database management, analysis, and assistance
```

Production meaning:

The dashboard is the control tower. It should not be a second customer site. It should show:

- total customers;
- active services;
- deployments;
- hosting/domain/VPS/email services;
- payment status;
- overdue accounts;
- service state live/dead;
- tickets and complaints;
- watchdog alerts;
- customer activity;
- admin actions;
- analytics summaries;
- dashboard sessions and admin usage.

Implementation target:

- mount dashboard under `/dashboard`;
- protect dashboard with admin auth;
- dashboard reads from API endpoints, not direct local JSON assumptions;
- dashboard can issue admin commands through controlled APIs;
- dashboard should show relationships: user -> services -> billing -> tickets -> activity -> admin commands.

Related plans:

- `11-admin-dashboard-ui.md`
- `12-backend-apis.md`
- `14-testing-acceptance.md`

## Right-Side Database Structure Extraction

The right-side database structure has five major blocks.

## 1. User Data

Diagram text:

```txt
Basic info
billing info
Service usage info
Complaints
services data/info
history/lastchanges
user-password
```

Production interpretation:

```txt
User profile
User auth/password hash
Billing profile/provider customer id
Owned services
Service usage summary
Tickets/complaints
User activity history
Last changed timestamps
Account status
```

Implementation guidance:

- `User` stores identity and account status.
- Passwords must be hashes only.
- Payment card details should be provider-owned, not raw local storage.
- Complaints become `Ticket` records.
- Service usage should be summarized from `ServiceAccess`, service records, and `AnalyticsEvent`.
- Last changes should be available through `AuditLog` and model timestamps.

Must avoid:

```txt
plaintext passwords
CVV
full card numbers
raw private documents
secret tokens in list APIs
```

## 2. Instruction Data

Diagram text:

```txt
Category1 Admin power instructions
Category2 Monitoring WatchDog
monitors suspicious activities breaking of site
scanning of site overrides all other notes data down
Category3 Analysts
stores customer activity on site
clicks mouse movement to many more
```

Production interpretation:

Instruction data is not normal customer data. It is operational control data.

Categories:

```txt
admin_power:
what admins are allowed to do and which operations are enabled

watchdog:
what the monitor checks, thresholds, severity rules, and alert policies

analytics:
what product/activity events are collected and how they are summarized
```

Implementation guidance:

- implement as `AdminPolicy`;
- link executed actions to `AdminCommand`;
- link proof/history to `AuditLog`;
- link suspicious events to `WatchdogEvent`;
- link behavior events to `AnalyticsEvent`;
- make dangerous actions require explicit admin reason;
- keep analytics privacy-safe and scrubbed.

Important production rule:

Watchdog should alert and mark review states first. It should not delete or cancel services automatically in v1.

## 3. Service Toggle Layer

Diagram text:

```txt
connected with user and admin dashboard
stores instructional data or key data like monthly subscription pass key before the pass key expires
if a service is active it records that
anything changes data is updated
dashboard is kept in loop as recorder
log session + power instruction
admin can disable/suspend/stop
via database
expanded throughout all services
keeps session tokens like how long a coupon can last
tracks all current services and marks state live/dead
```

Production interpretation:

This is the heart of the access-control architecture.

Implementation target:

- `ServiceAccess` is the service toggle/pass row.
- One service instance equals one `ServiceAccess` row.
- `accessStatus` tracks usable state.
- `billingStatus` tracks paid/trial/free/overdue/failed.
- `adminStatus` tracks allowed/blocked/review.
- `startsAt` and `expiresAt` define the monthly pass window.
- discount/coupon validity belongs in billing/discount policy records or `metadata` until a formal coupon model exists.
- every change writes `AuditLog`.
- admin changes write `AdminCommand`.

Required service states:

```txt
pending
active
suspended
expired
cancelled
deleted
live
dead
review_required
```

Use `live/dead` carefully:

- `accessStatus` answers whether user can use it;
- service health/deployment status answers whether the service is technically live.

Do not collapse both meanings into one field.

## 4. Customer Services Layer

Diagram text:

```txt
customer complaints
ticketing systems
different service complaints section
billing, hosting, domain name, VPS
basically all customer and admin conversations
ChatBot interactions, questions and answers
basic chatbot data for training and answering
```

Production interpretation:

This is CRM, but CRM means customer support and relationship management, not HR.

Implementation target:

- tickets for complaints and service requests;
- ticket messages for customer/admin conversations;
- categories for billing, hosting, domain, VPS, email, account, complaint, general;
- admin notes for internal notes;
- chatbot interactions as a future CRM extension;
- chatbot knowledge entries only after admin approval;
- ticket records link to user and service where possible.

Required behavior:

- customer can only view their own tickets;
- admin can view all tickets;
- admin can assign, reply, resolve, close;
- customer replies reopen/pending-admin state;
- customer service data should appear in dashboard and user detail pages.

## 5. Dashboard Data

Diagram text:

```txt
session tokens change history
email lists
ChatAI session history data
all data that requires dashboard to use and manage in the same database but different table
```

Production interpretation:

Dashboard data is operational admin data. It should live in the same database for consistency, but separate tables so it does not pollute customer/service records.

Implementation target:

- `DashboardSession` for admin dashboard sessions;
- `AdminNote` for private admin notes;
- `CrmEmailList` and `CrmEmailListMember` for dashboard-managed communication lists;
- `CrmAiSession` for AI/admin assistant conversations;
- `ChatbotInteraction` for customer bot sessions;
- `ChatbotKnowledgeEntry` for approved bot training data.

Rules:

- dashboard session tokens should be hashed or referenced, not exposed raw;
- admin-only records must require admin auth;
- dashboard activity should not impersonate customer activity;
- admin AI/chat data must be scrubbed of secrets before storage.

## Production Boundary Rules

These rules prevent the build from becoming messy.

## Rule 1: Service Logic Does One Job

Hosting code handles hosting.

VPS code handles VPS.

Domain code handles domains.

Email code handles email.

None of them should invent their own admin rules, billing rules, or dashboard state.

## Rule 2: Access Is Centralized

Before a user uses a paid/controlled service:

```txt
authMiddleware
-> serviceAccessService.ensureServiceAccess()
-> service business logic
```

No paid/controlled service should skip this.

## Rule 3: Admin Power Is Audited

Every admin action must produce:

```txt
AdminCommand
AuditLog
ServiceAccess update when service access changes
Notification when customer/admin needs to know
```

## Rule 4: Watchdog Watches First

Watchdog detects:

- overdue services;
- stuck deployments;
- repeated failures;
- suspicious access attempts;
- unusually high activity;
- unanswered tickets;
- disabled service access attempts.

V1 watchdog should create alerts and review states. It should not auto-delete customer accounts or services.

## Rule 5: Analytics Is Not Proof

Analytics helps understand behavior.

Audit logs prove important changes.

Do not use analytics as billing proof, service ownership proof, or admin-action proof.

## Rule 6: Dashboard Controls Through APIs

The dashboard should not directly edit database files or hidden JSON stores.

Dashboard action flow:

```txt
admin clicks action
-> admin API endpoint
-> requireAdmin
-> validate target
-> AdminCommand
-> service/update function
-> AuditLog
-> response to dashboard
```

## Expanded Implementation Guidance

## Phase 0: Resolve Product Definitions

Before coding large features, lock these definitions:

```txt
One login User can own many services.
One login User may later belong to many Organizations/customer accounts.
Services are projects/assets under a user or organization.
Payment provider data stays provider-owned.
ServiceAccess is the internal monthly access pass.
Discounts affect billing amount, not admin/service blocks.
```

If the implementation needs "multiple accounts" in v1, use `organizationId` where available but keep `User.id` as the fallback owner. Do not create duplicate login users for each service.

## Phase 0.5: Production Hardening Baseline

Before real payments and admin controls go live, implement the baseline from `15-production-hardening.md`:

```txt
environment validation
secret management
backup and restore checklist
webhook verification and idempotency
rate limiting and abuse protection
admin MFA for sensitive roles
```

Outcome:

- production does not start with missing critical secrets;
- payment/provider webhooks cannot be spoofed easily;
- admin power has stronger authentication;
- migrations have a backup/rollback plan;
- spam and brute-force attempts are throttled.

Also follow `17-main-site-dashboard-middleware-fit.md` to align the main site, admin dashboard, API routes, middleware stack, warnings, and watchdog tagging.

## Phase A: Normalize Control Data

Implement first:

```txt
ServiceAccess
AdminPolicy
AdminCommand
AuditLog usage improvements
DashboardSession
```

Outcome:

- every service has a control row;
- dashboard can see service access state;
- admin actions are recorded;
- instruction policies exist.

## Phase B: Connect Billing To Access

Implement:

```txt
payment success -> ServiceAccess active/paid/expiresAt updated
payment failure -> billingStatus failed/overdue
manual receipt approval -> ServiceAccess active/paid
manual receipt rejection -> ServiceAccess pending/failed
renewal -> expiresAt extended
```

Outcome:

- payment drives access;
- access expires cleanly;
- admin can see who paid and who is overdue.

## Phase C: Connect Services To Access

Implement access gates for:

```txt
hosting deployments
VPS actions
domain actions
email hosting actions
builder/deployment features
```

Outcome:

- users cannot use unpaid/blocked/expired services;
- admin blocks apply across the platform.

## Phase D: Build Dashboard Monitoring Views

Implement dashboard views:

```txt
Overview
Customers
Services
Deployments
Domains
VPS
Billing
Tickets
Activity
Watchdog
Settings / Instruction Policies
```

Outcome:

- admin can monitor users and services;
- admin can trace each user to their services, payments, tickets, and activity.

## Phase E: Build CRM / Customer Service

Implement:

```txt
Ticket
TicketMessage
AdminNote
ticket categories
customer ticket APIs
admin ticket APIs
CRM side panel using ticket data
```

Outcome:

- old HR CRM becomes customer support CRM;
- service complaints become structured tickets.

## Phase F: Build Watchdog

Implement:

```txt
WatchdogEvent
watchdog scan service
payment overdue scan
deployment stuck scan
service failure scan
blocked access attempt scan
ticket unanswered scan
admin dashboard alerts
```

Outcome:

- suspicious and unusual activity appears in dashboard;
- admin can review, dismiss, or escalate.

## Phase F2: Add Operations Infrastructure

Implement the operational systems that keep the dashboard reliable:

```txt
provider integration registry
provider health checks
provider sync runs
scheduled job runs
notification delivery
permission checks
retention policies
```

Outcome:

- external hosting/domain/VPS/email/payment providers are visible and syncable;
- background jobs are tracked instead of invisible;
- admins see alerts when jobs/providers fail;
- data retention and privacy rules are enforceable;
- admin permissions can grow beyond one all-powerful role.

## Phase G: Build Analytics

Implement:

```txt
AnalyticsEvent
safe event capture
customer journey events
service usage events
billing funnel events
dashboard admin usage events
analytics summaries
```

Outcome:

- admin can see customer behavior and service usage;
- analytics remains separate from audit and billing truth.

## Phase H: Add Dashboard-Only Data

Implement after core systems:

```txt
CrmEmailList
CrmEmailListMember
CrmAiSession
ChatbotInteraction
ChatbotKnowledgeEntry
```

Outcome:

- dashboard can manage email/customer groups;
- chatbot and AI sessions have safe storage;
- future customer service automation is prepared.

## Phase I: Add Business Operations

Implement the business operations systems from `16-business-operations-and-reporting.md`:

```txt
invoices, tax rates, credit notes
customer onboarding lifecycle
service health checks, incidents, maintenance windows
observability and system health
export jobs and admin reports
```

Outcome:

- customers can receive proper billing documents;
- admins can see onboarding friction;
- service health and incidents are trackable;
- operators can debug the app with request IDs/logs/metrics;
- business reports can be exported safely.

## Coding AI Guidance

When giving this to Claude/Grok, tell it:

```txt
Read Planning/00-diagram-extraction-and-guidance.md first.
Then follow Planning/01 through Planning/14 in order.
Do not jump into UI before the data/control model is clear.
Do not store plaintext passwords, CVV, full cards, or raw secrets.
Implement ServiceAccess as the central monthly access pass.
Implement AdminPolicy as the instruction-data table.
Implement AdminCommand and AuditLog for every admin power action.
Keep service controllers focused on their own business logic.
Use tickets/CRM for customer service, not HR.
Use WatchdogEvent for monitoring alerts.
Use AnalyticsEvent for behavior summaries, not proof.
Keep dashboard-only data in separate tables.
```

## Acceptance Checklist From Diagram

The implementation is aligned with the diagram when:

- every customer service instance can be traced to a user;
- every service has a `ServiceAccess` state;
- paid/expired/blocked states affect access;
- admin dashboard can see all users, services, payments, tickets, and activity;
- admin actions are executed through controlled APIs;
- instruction/policy data exists separately from service records;
- watchdog can flag suspicious or failed service behavior;
- analytics can show user activity safely;
- customer complaints become tickets;
- CRM contains customer conversations, not HR data;
- dashboard sessions, email lists, and AI/chat history have separate dashboard tables;
- no sensitive secrets are exposed through public or admin list APIs.
