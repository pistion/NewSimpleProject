# Migration and Compatibility

## Stage 1 — Additive backend
Add repositories, DTOs, oversight service and new endpoints. Keep old endpoints.

## Stage 2 — Admin UI adoption
Move the customer detail page to the new endpoints while keeping existing lists.

## Stage 3 — Hosting relational alignment
Audit JSON deployments and backfill:
- user ownership
- organization ownership
- ServiceAccess
- billing links
- relational hosting records

## Stage 4 — Dual-source verification
Read relational data, compare with the legacy store, log mismatches and do not silently overwrite conflicts.

## Stage 5 — Relational authority
After verification, make relational records authoritative for admin oversight.

## Schema rules
- additive first
- no destructive renames initially
- preserve IDs
- add indexes
- add relations where safe
- backfill before making fields required

## Data repair report
Every backfill must report scanned, updated, skipped, conflicting, unresolved and failed records.
