# Admin Dashboard UI Plan

## Customer detail page
### Header
- customer name
- client ID
- organization
- email and phone
- account status
- plan
- signup date
- verification status
- lifecycle actions

### Summary cards
- active services
- outstanding balance
- open tickets
- pending receipts
- failed services
- upcoming renewals
- security warnings

### Tabs
1. Overview
2. Services
3. Billing
4. Support
5. Operations
6. Activity

### Services table
| Service | Type | Status | Access | Billing | Provider | Plan | Updated |
|---|---|---|---|---|---|---|---|

### Billing
- orders
- receipts
- subscriptions
- invoices
- credits
- payment methods

### Support
- tickets
- service requests
- messages
- linked services

### Operations
- provider resources
- health checks
- incidents
- sync state
- watchdog events
- cleanup requirements

### Activity
Combine customer, admin, service, payment and security events.

## Loading
- load overview first
- lazy-load heavy tabs
- preserve loaded state
- paginate activity, tickets and billing
- show section-level errors
