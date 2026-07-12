# Data Relationship Model

## Meanings
```text
User = login identity and person
Organization = customer/business account that owns services
Client ID = human-readable customer reference
```

Until a dedicated Organization table exists, preserve compatibility but document one clear ownership rule.

## Customer root
```text
Customer
├── account
├── projects
├── services
├── billing
├── support
├── operations
└── activity
```

## ServiceAccess as the service index
For each ServiceAccess row, resolve the underlying record:

```text
hosting → WebHostingService or deployment
vps → VpsService
domain → BusinessService
email → BusinessService
builder → ClientProject or deployment
support → support record
```

## Billing
```text
Customer
├── CheckoutOrder
│   └── PaymentReceipt
├── DeploymentSubscription
├── Invoice
│   └── InvoiceLineItem
├── CreditNote
└── PaymentMethod
```

## Support
```text
Customer
├── Ticket
│   └── TicketMessage
└── ServiceRequest
```

## Operations
```text
Customer service
├── ProviderResource
├── ServiceHealthCheck
├── Incident
├── WatchdogEvent
├── ProviderSyncRun
└── AuditLog
```

## Ownership resolution priority
1. direct `userId`
2. direct `organizationId`
3. ServiceAccess
4. linked service
5. linked order/deployment
6. metadata only as a final compatibility fallback
