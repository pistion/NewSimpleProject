# 08 - Tickets, CRM, And Customer Service Implementation Plan

## Goal

Turn the old CRM concept into a customer service and communication layer for GlondiaSites.

The CRM sidebar in `/dashboard` should support:

```txt
customer support inbox
tickets and complaints
billing questions
hosting/domain/VPS/email service requests
customer notes
admin replies
future chatbot data
future email/AI workflows
```

This replaces the old HR meaning.

## Current State

The dashboard has restored CRM UI files from the old Heya dashboard:

```txt
admin-dashboard/frontend/_legacy-heya-hr/crm-workspace.jsx
admin-dashboard/frontend/_legacy-heya-hr/crm-email-action.jsx
admin-dashboard/frontend/_legacy-heya-hr/public-bot-workspace.jsx
```

The CRM is currently a secondary sidebar layer, not a normal main sidebar item.

The backend does not yet provide production ticket/CRM routes. Current CRM API methods in the dashboard are safe fallbacks.

## Production Meaning Of CRM

CRM should mean:

```txt
Customer Relationship Management
Customer support
Customer service requests
Customer communications
Admin customer notes
Basic chatbot/customer question data
```

CRM should not mean:

```txt
HR
Applicants
Positions
Recruiting
Screening
Talent pool
```

## Required Tables

Use:

```txt
Ticket
TicketMessage
AdminNote
Notification
AuditLog
AnalyticsEvent
WatchdogEvent
```

Optional future:

```txt
CrmContact
CrmConversation
CrmEmailMessage
CrmEmailList
CrmEmailListMember
CrmAiSession
ChatbotInteraction
ChatbotQuestion
ChatbotKnowledgeEntry
```

Do not implement optional future tables until tickets and service requests work.

## Customer Services Layer Coverage

This plan must cover the customer-services block from the diagram:

```txt
customer complaints
billing questions
hosting support
domain name support
VPS support
email hosting support
customer/admin conversations
chatbot questions and answers
basic chatbot training data
```

V1 should implement this through `Ticket`, `TicketMessage`, and `AdminNote`.

V2 should expand the CRM side panel with:

- `CrmEmailList` and `CrmEmailListMember` for customer email groups.
- `CrmAiSession` for AI-assisted admin/customer sessions.
- `ChatbotInteraction` for customer bot conversations and escalations.
- `ChatbotKnowledgeEntry` for approved training/help content.

The CRM must stay connected to real users and real services. A ticket about a VPS should link to the user and that VPS `ServiceAccess` row, not float as a disconnected message.

## Ticket Categories

Supported categories:

```txt
billing
hosting
domain
vps
email
account
complaint
general
```

Dashboard labels:

```txt
Billing
Hosting
Domains
VPS
Email
Account
Complaint
General
```

## Ticket Status

Use:

```txt
open
pending_admin
pending_customer
resolved
closed
```

Rules:

- New customer ticket starts as `open`.
- When admin replies and needs customer response, set `pending_customer`.
- When customer replies, set `pending_admin`.
- Admin can mark `resolved`.
- Closed tickets remain visible in history.

## Ticket Priority

Use:

```txt
low
normal
high
urgent
```

Default:

```txt
normal
```

Urgent examples:

```txt
site down
payment taken but service blocked
domain expired unexpectedly
security/account access issue
```

## Customer APIs

Add customer ticket endpoints:

```txt
GET /api/v1/tickets
POST /api/v1/tickets
GET /api/v1/tickets/:ticketId
POST /api/v1/tickets/:ticketId/messages
POST /api/v1/tickets/:ticketId/close
```

Customer create body:

```json
{
  "category": "hosting",
  "priority": "normal",
  "subject": "My deployment is stuck",
  "body": "The site has been building for 30 minutes.",
  "relatedServiceType": "hosting",
  "relatedServiceId": "dep_x"
}
```

Rules:

- Customer can only see own tickets.
- Customer can only attach own service IDs.
- Ticket creation writes `AuditLog`.
- Ticket creation notifies admins.

## Admin APIs

Add admin ticket endpoints:

```txt
GET /api/admin/tickets
GET /api/admin/tickets/:ticketId
POST /api/admin/tickets/:ticketId/messages
PATCH /api/admin/tickets/:ticketId
POST /api/admin/tickets/:ticketId/assign
POST /api/admin/tickets/:ticketId/resolve
POST /api/admin/tickets/:ticketId/close
GET /api/admin/users/:userId/tickets
```

Admin filters:

```txt
status
category
priority
userId
assignedAdminId
relatedServiceType
relatedServiceId
search
limit
offset
```

Admin update fields:

```txt
status
priority
category
assignedAdminId
relatedServiceType
relatedServiceId
```

Rules:

- Admin replies create user notifications.
- Status changes write `AuditLog`.
- Assignment writes `AuditLog`.
- Closing/resolving writes `AuditLog`.

## CRM Sidebar Mapping

CRM secondary sidebar should map as:

```txt
Overview:
support summary, open tickets, urgent tickets, recent messages

Inbox:
customer/admin conversations and ticket messages

Service Requests:
tickets, complaints, billing issues, hosting/domain/VPS requests

Email Lists:
customer contact lists and future broadcast groups

AI Chat:
future admin assistant for ticket summaries and reply drafting

Website Bots:
future chatbot question/answer data

Automations:
future workflows like overdue reminders and ticket follow-ups
```

## Dashboard Ticket UI

Ticket list columns:

```txt
subject
customer
category
priority
status
related service
last message
created date
updated date
assigned admin
```

Ticket detail should show:

```txt
customer profile summary
related service card
conversation thread
status controls
priority controls
assignment
admin notes
activity
watchdog flags
```

Customer detail should show:

```txt
open tickets
closed tickets
latest ticket messages
ticket count by category
```

## Notifications

Create notifications:

Customer ticket created:

```txt
admin notification
```

Admin reply:

```txt
user notification
```

Customer reply:

```txt
admin notification
```

Ticket resolved/closed:

```txt
user notification
```

## Audit Events

Required:

```txt
ticket.created
ticket.message_created
ticket.assigned
ticket.status_changed
ticket.priority_changed
ticket.resolved
ticket.closed
```

Metadata should include:

```txt
ticketId
category
priority
status
relatedServiceType
relatedServiceId
```

## Implementation Steps

1. Add `Ticket` and `TicketMessage` models.
2. Create `ticketService.js`.
3. Add customer ticket routes.
4. Add admin ticket routes.
5. Add notifications for ticket lifecycle.
6. Add audit logs for ticket lifecycle.
7. Replace CRM fallback service request API with real ticket API calls.
8. Update dashboard CRM Service Requests to render tickets.
9. Add customer detail ticket panel.
10. Add main customer site ticket/support page if not already available.

## Acceptance Criteria

- Customer can create a ticket.
- Customer can view only own tickets.
- Admin can view all tickets.
- Admin can reply to tickets.
- Customer receives notification on admin reply.
- Admin receives notification on new customer ticket/reply.
- Ticket appears in customer detail.
- CRM sidebar Service Requests uses real tickets, not HR data.
- No HR/applicant language remains in active CRM labels for v1.
