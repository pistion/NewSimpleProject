# 06 - Admin Command Layer Implementation Plan

## Goal

Create a controlled admin power layer. Admins must be able to suspend users, reactivate accounts, cancel services, approve receipts, apply discounts, force redeploys, and flag security reviews, but every action must be recorded, auditable, reversible where possible, and visible from the dashboard.

The admin dashboard should not silently mutate random database rows. It should issue explicit commands.

## Core Principle

Every admin power action follows this flow:

```txt
Admin clicks action
-> backend verifies admin
-> backend creates AdminCommand
-> backend captures beforeState
-> backend performs action through service layer
-> backend updates ServiceAccess / service record / billing record
-> backend captures afterState
-> backend writes AuditLog
-> backend optionally creates user/admin notification
-> dashboard refreshes
```

## Current State

Existing admin actions already exist in:

```txt
server/src/services/adminService.js
server/src/routes/admin.routes.js
```

Current actions include:

```txt
approve receipt
reject receipt
mark deployment paid
renew deployment manually
delete order
suspend user
disable user
reactivate user
delete user
suspend deployment
reactivate deployment
approve deployment billing
set deployment render plan
delete deployment
```

These actions already write `AuditLog` in many places. The new layer must wrap or extend them, not remove them.

## Admin Roles And Permission Matrix

Do not treat every admin as a super admin. Define permission groups before wiring destructive actions.

Recommended roles:

```txt
super_admin:
full dashboard control, policies, billing, service suspension, user disable/delete

admin:
customer/service management, ticket management, receipt review, normal service actions

billing_admin:
orders, receipts, payment status, discounts, refunds, billing notes

support_admin:
tickets, customer notes, customer communication, non-destructive service visibility

security_admin:
watchdog review, account/service review flags, security notes, forced token/session revocation

read_only_admin:
dashboard visibility only, no mutations

system:
background jobs, provider sync, watchdog scans
```

V1 can keep `User.role === "admin"` for compatibility, but command execution should be written so finer permissions can be added without rewriting every route.

Permission examples:

```txt
approve receipt -> super_admin, admin, billing_admin
reject receipt -> super_admin, admin, billing_admin
apply discount -> super_admin, billing_admin
revoke discount -> super_admin, billing_admin
suspend service -> super_admin, admin
reactivate service -> super_admin, admin
delete/cancel service -> super_admin only in v1
disable user -> super_admin only in v1
soft delete user -> super_admin only in v1
review watchdog event -> super_admin, admin, security_admin
dismiss critical watchdog event -> super_admin, security_admin
reply to ticket -> super_admin, admin, support_admin
change AdminPolicy -> super_admin only in v1
view dashboard -> all admin roles
```

Implementation guidance:

- Add a `requirePermission(permissionKey)` helper when role granularity is introduced.
- Store permission decisions in `AdminCommand.metadata.permission`.
- Failed permission attempts should write `AuditLog` and may create `WatchdogEvent`.
- Destructive actions require a reason.
- Super admin-only actions should be visually marked in the dashboard.

## Required Table

Use the `AdminCommand` model defined in `01-data-backbone.md`.

Required statuses:

```txt
pending
completed
failed
cancelled
```

Required command types:

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
CREATE_MANUAL_RENEWAL
SET_RENDER_PLAN
FORCE_REDEPLOY
APPLY_DISCOUNT
FLAG_SECURITY_REVIEW
ADD_ADMIN_NOTE
```

## Backend Service

Create:

```txt
server/src/services/adminCommandService.js
```

Required functions:

```js
async function createAdminCommand(input)
async function completeAdminCommand(commandId, afterState, metadata)
async function failAdminCommand(commandId, error, metadata)
async function executeAdminCommand(input, executor)
async function listAdminCommands(filters)
async function listUserAdminCommands(userId)
async function getAdminCommand(commandId)
```

`executeAdminCommand` should be the main helper.

Expected input:

```js
{
  adminUserId,
  targetUserId,
  targetServiceType,
  targetServiceId,
  commandType,
  reason,
  beforeState,
  metadata
}
```

Executor pattern:

```js
return executeAdminCommand(commandInput, async (command) => {
  const result = await performRealAction();
  return {
    result,
    afterState: buildAfterState(result)
  };
});
```

Rules:

- If executor succeeds, command status becomes `completed`.
- If executor throws, command status becomes `failed` and error is stored.
- Failed commands still remain visible in dashboard.
- Never hide failed admin commands.

## Before And After State

Before state should be a safe JSON snapshot of the target entity before mutation.

Examples:

For user:

```json
{
  "id": "user-id",
  "role": "member",
  "accountStatus": "active",
  "disabledAt": null
}
```

For deployment/service:

```json
{
  "serviceType": "hosting",
  "serviceId": "dep_x",
  "status": "live",
  "paymentStatus": "paid",
  "accessStatus": "active",
  "adminStatus": "allowed"
}
```

Never include:

```txt
passwordHash
refresh token hashes
raw receipt file paths
raw ID photo paths
provider API secrets
full payment method data
```

## Admin Command API

Add routes:

```txt
GET /api/admin/commands
GET /api/admin/commands/:commandId
GET /api/admin/users/:userId/commands
```

Filters:

```txt
adminUserId
targetUserId
targetServiceType
targetServiceId
commandType
status
limit
offset
```

Response for list:

```json
{
  "items": [],
  "summary": {
    "total": 0,
    "completed": 0,
    "failed": 0,
    "pending": 0
  }
}
```

Do not expose command creation as a generic free-form endpoint in v1. Commands should be created by explicit admin action endpoints so permissions and validation stay clear.

## Existing Endpoint Wrapping

Wrap these existing admin actions:

```txt
POST /api/admin/users/:userId/suspend
POST /api/admin/users/:userId/disable
POST /api/admin/users/:userId/reactivate
POST /api/admin/users/:userId/delete
POST /api/admin/deployments/:deploymentId/suspend
POST /api/admin/deployments/:deploymentId/reactivate
POST /api/admin/deployments/:deploymentId/mark-paid
POST /api/admin/deployments/:deploymentId/approve-billing
POST /api/admin/deployments/:deploymentId/renew-manually
POST /api/admin/deployments/:deploymentId/render-plan
POST /api/admin/deployments/:deploymentId/delete
POST /api/admin/receipts/:receiptId/approve
POST /api/admin/receipts/:receiptId/reject
POST /api/admin/orders/:orderId/delete
```

Each endpoint should:

- build command input
- capture before state
- call `executeAdminCommand`
- perform the existing action inside executor
- update ServiceAccess when applicable
- write AuditLog

## Dashboard Requirements

Add command visibility in these locations:

Admin Activity page:

```txt
Recent admin commands
Failed admin commands
Command type filter
Admin actor filter
Target user/service filter
```

Customer detail:

```txt
Admin commands affecting this user
Command type
Admin actor
Reason
Status
Created date
Before/after summary
```

Service detail:

```txt
Admin commands affecting this service
```

Command row fields:

```txt
command type
status
admin
target user
target service
reason
created date
error if failed
```

## Notifications

Create user notifications for customer-impacting commands:

```txt
SUSPEND_USER
REACTIVATE_USER
DISABLE_USER
SUSPEND_SERVICE
REACTIVATE_SERVICE
CANCEL_SERVICE
APPROVE_RECEIPT
REJECT_RECEIPT
MARK_DEPLOYMENT_PAID
```

Do not notify customer for internal admin notes unless explicitly requested.

## Implementation Steps

1. Add `AdminCommand` model if not already added.
2. Create `adminCommandService.js`.
3. Add admin command list/detail routes.
4. Wrap receipt approval/rejection first.
5. Wrap deployment suspend/reactivate/mark-paid next.
6. Wrap user lifecycle actions.
7. Add dashboard command list API client methods.
8. Add command panels in customer detail and activity page.
9. Add tests for completed and failed commands.

## Acceptance Criteria

- Every admin lifecycle action creates an `AdminCommand`.
- Failed admin actions create failed command records.
- Existing `AuditLog` behavior still works.
- Admin dashboard can list commands.
- Customer detail shows commands affecting that customer.
- Service actions update `ServiceAccess`.
- No private fields leak inside before/after state.
