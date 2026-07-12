# Implementation Checklist

## Discovery
- [ ] Read all pack files
- [ ] Scan admin backend and frontend
- [ ] Scan Prisma and hosting store
- [ ] Map all customer-owned tables
- [ ] Map userId, organizationId and clientId

## Architecture
- [ ] No Prisma in admin routes/controllers/services
- [ ] Repositories reuse db.js
- [ ] No second Prisma client
- [ ] No second admin database

## Relationships
- [ ] Customer root defined
- [ ] ServiceAccess is service index
- [ ] Projects connected
- [ ] Hosting connected
- [ ] VPS connected
- [ ] Domains and email connected
- [ ] Orders, receipts, subscriptions and invoices connected
- [ ] Tickets and requests connected
- [ ] Notifications and operations connected
- [ ] Audit history connected

## Backend
- [ ] Oversight service
- [ ] DTOs
- [ ] Unified overview endpoint
- [ ] Section endpoints
- [ ] Old endpoints preserved

## Hosting migration
- [ ] Ownership audited
- [ ] Missing links repaired
- [ ] Relational records backfilled
- [ ] Mismatch report produced

## UI
- [ ] Header
- [ ] Summary cards
- [ ] Six tabs
- [ ] Filters and pagination
- [ ] Empty and error states
- [ ] Mobile responsiveness

## Security
- [ ] Admin auth and permissions
- [ ] MFA for sensitive writes
- [ ] Cross-customer isolation
- [ ] Secrets excluded
- [ ] Admin actions audited

## Validation
- [ ] Prisma format
- [ ] Prisma validate
- [ ] Prisma generate
- [ ] Tests
- [ ] Frontend build
- [ ] Backend startup
- [ ] Smoke test
- [ ] Final diff review
