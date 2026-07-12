# Database Schema and Data Migration

The repository already uses Prisma with SQLite. Use it as the production source of truth. JSON fields may remain serialized `String` columns until a future Postgres migration.

Adapt names to existing conventions, but preserve the relationships, uniqueness, ownership, lifecycle, and job durability below.

## 1. Recommended Prisma models

### BuilderProject

```prisma
model BuilderProject {
  id                    String    @id @default(uuid())
  userId                String    @map("user_id")
  clientProjectId       String?   @map("client_project_id")
  sourceType            String    @map("source_type") // template | github | zip
  templateId            String?   @map("template_id")
  templateVersion       String?   @map("template_version")
  templateSourceCommit  String?   @map("template_source_commit")
  templateManifestHash  String?   @map("template_manifest_hash")
  name                  String
  slug                  String
  status                String    @default("DRAFT")
  version               Int       @default(1)
  currentRevisionId     String?   @map("current_revision_id")
  approvedRevisionId    String?   @map("approved_revision_id")
  planJson              String    @default("{}") @map("plan_json")
  answerSheetJson       String    @default("{}") @map("answer_sheet_json")
  metadata              String    @default("{}")
  archivedAt            DateTime? @map("archived_at")
  deletedAt             DateTime? @map("deleted_at")
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")

  user                  User @relation(fields: [userId], references: [id], onDelete: Restrict)
  revisions             BuilderRevision[]
  jobs                  BuilderJob[]
  previewGrants         BuilderPreviewGrant[]
  deploymentLinks       BuilderDeploymentLink[]

  @@unique([userId, slug])
  @@index([userId, status])
  @@index([clientProjectId])
  @@index([templateId, templateVersion])
  @@index([updatedAt])
  @@map("builder_projects")
}
```

Add the reverse relation to `User` and optionally `ClientProject` if the existing schema supports it cleanly.

### BuilderRevision

```prisma
model BuilderRevision {
  id                    String    @id @default(uuid())
  projectId             String    @map("project_id")
  revisionNumber        Int       @map("revision_number")
  parentRevisionId      String?   @map("parent_revision_id")
  status                String    @default("DRAFT")
  planSnapshotJson      String    @default("{}") @map("plan_snapshot_json")
  answerSheetJson       String    @default("{}") @map("answer_sheet_json")
  generatedSiteJson     String    @default("{}") @map("generated_site_json")
  artifactLocation      String?   @map("artifact_location")
  artifactChecksum      String?   @map("artifact_checksum")
  sourceCommit          String?   @map("source_commit")
  generationModel       String?   @map("generation_model")
  generationUsageJson   String    @default("{}") @map("generation_usage_json")
  validationJson        String    @default("{}") @map("validation_json")
  changeRequestJson     String    @default("{}") @map("change_request_json")
  createdByUserId       String?   @map("created_by_user_id")
  approvedByUserId      String?   @map("approved_by_user_id")
  approvedAt            DateTime? @map("approved_at")
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")

  project               BuilderProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  jobs                  BuilderJob[]
  previewGrants         BuilderPreviewGrant[]
  deploymentLinks       BuilderDeploymentLink[]

  @@unique([projectId, revisionNumber])
  @@index([projectId, status])
  @@index([artifactChecksum])
  @@map("builder_revisions")
}
```

Do not mutate approved revisions. A requested change produces a new revision.

### BuilderJob

```prisma
model BuilderJob {
  id                    String    @id @default(uuid())
  projectId             String    @map("project_id")
  revisionId            String?   @map("revision_id")
  jobType               String    @map("job_type")
  status                String    @default("QUEUED")
  stage                 String?
  idempotencyKey        String    @unique @map("idempotency_key")
  requestHash           String?   @map("request_hash")
  payloadJson           String    @default("{}") @map("payload_json")
  resultJson            String    @default("{}") @map("result_json")
  progressJson          String    @default("{}") @map("progress_json")
  errorCode             String?   @map("error_code")
  errorMessage          String?   @map("error_message")
  attempt               Int       @default(0)
  maxAttempts           Int       @default(3) @map("max_attempts")
  availableAt           DateTime  @default(now()) @map("available_at")
  leaseOwner            String?   @map("lease_owner")
  leaseExpiresAt        DateTime? @map("lease_expires_at")
  startedAt             DateTime? @map("started_at")
  finishedAt            DateTime? @map("finished_at")
  cancelledAt           DateTime? @map("cancelled_at")
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")

  project               BuilderProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  revision              BuilderRevision? @relation(fields: [revisionId], references: [id], onDelete: SetNull)
  events                BuilderJobEvent[]

  @@index([status, availableAt])
  @@index([leaseExpiresAt])
  @@index([projectId, createdAt])
  @@index([revisionId])
  @@map("builder_jobs")
}
```

### BuilderJobEvent

```prisma
model BuilderJobEvent {
  id                    String   @id @default(uuid())
  jobId                 String   @map("job_id")
  sequence              Int
  stage                 String?
  level                 String   @default("info")
  message               String
  detailsJson           String   @default("{}") @map("details_json")
  createdAt             DateTime @default(now()) @map("created_at")

  job                   BuilderJob @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@unique([jobId, sequence])
  @@index([jobId, createdAt])
  @@map("builder_job_events")
}
```

### BuilderPreviewGrant

```prisma
model BuilderPreviewGrant {
  id                    String    @id @default(uuid())
  projectId             String    @map("project_id")
  revisionId            String    @map("revision_id")
  tokenHash             String    @unique @map("token_hash")
  audience              String    @default("owner")
  expiresAt             DateTime  @map("expires_at")
  revokedAt             DateTime? @map("revoked_at")
  lastUsedAt            DateTime? @map("last_used_at")
  createdByUserId       String?   @map("created_by_user_id")
  createdAt             DateTime  @default(now()) @map("created_at")

  project               BuilderProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  revision              BuilderRevision @relation(fields: [revisionId], references: [id], onDelete: Cascade)

  @@index([projectId, expiresAt])
  @@index([revisionId])
  @@map("builder_preview_grants")
}
```

### BuilderDeploymentLink

```prisma
model BuilderDeploymentLink {
  id                    String   @id @default(uuid())
  projectId             String   @map("project_id")
  revisionId            String   @map("revision_id")
  deploymentId          String   @unique @map("deployment_id")
  idempotencyKey        String   @unique @map("idempotency_key")
  status                String   @default("QUEUED")
  isCurrent             Boolean  @default(true) @map("is_current")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  project               BuilderProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  revision              BuilderRevision @relation(fields: [revisionId], references: [id], onDelete: Restrict)

  @@index([projectId, isCurrent])
  @@index([revisionId])
  @@index([status])
  @@map("builder_deployment_links")
}
```

Enforce one current link per project in service logic/transaction if SQLite cannot express a partial unique index through Prisma.

### AI usage

```prisma
model AiUsageEvent {
  id                    String   @id @default(uuid())
  userId                String?  @map("user_id")
  projectId             String?  @map("project_id")
  jobId                 String?  @map("job_id")
  provider              String
  model                 String
  operation             String
  promptTokens          Int      @default(0) @map("prompt_tokens")
  completionTokens      Int      @default(0) @map("completion_tokens")
  estimatedCostMicros   Int      @default(0) @map("estimated_cost_micros")
  status                String
  requestId             String?  @map("request_id")
  metadata              String   @default("{}")
  createdAt             DateTime @default(now()) @map("created_at")

  @@index([userId, createdAt])
  @@index([projectId, createdAt])
  @@index([jobId])
  @@map("ai_usage_events")
}
```

## 2. Deployment persistence

Migrate or bridge file-backed deployment records into relational storage. Do not create a conflicting second deployment concept when an existing Prisma model can be extended.

The authoritative deployment record must support:

- deployment/user/project/revision IDs
- provider service/deploy IDs
- source type and controlled/original repo metadata
- status, build status, current step
- live URL and verification
- environment metadata without secret values
- trial/payment/subscription state
- timestamps and errors
- idempotency and reconciliation timestamps

Deployment events/logs should be rows, not unbounded nested JSON.

## 3. Repository layer

Create domain repositories/services rather than calling Prisma ad hoc:

```text
builderProjectRepository
builderRevisionRepository
builderJobRepository
builderPreviewGrantRepository
builderDeploymentRepository
builderAccessService
builderStateMachine
```

They own serialization, ownership filters, soft-delete filters, optimistic updates, transaction boundaries, uniqueness handling, and audit integration.

## 4. Optimistic concurrency

Plan updates require `expectedVersion` and update only where `version` matches. Return `409 BUILDER_VERSION_CONFLICT` when stale.

The frontend must reload or offer conflict resolution.

## 5. Transaction boundaries

Use transactions for:

### Generation request

- verify project state
- create revision placeholder
- create job
- transition project to queued
- write audit event

### Revision approval

- verify revision ready
- supersede previous approval according to policy
- approve selected revision
- set project approval pointer/status
- audit

### Deployment request

- verify approved revision
- reserve idempotency key
- create/link deployment job
- transition project
- audit

### Billing attachment

- verify billable state
- create/reuse order
- create/reuse subscription
- update deployment
- audit

Do not hold database transactions open across OpenAI/GitHub/Render/PayPal calls.

## 6. JSON schema versioning

Each serialized document includes:

```json
{
  "schemaVersion": 1,
  "data": {}
}
```

Validate at repository boundaries and normalize legacy data before generation.

## 7. Legacy migration sources

Locate and migrate:

- `template-site-plans/plans.json`
- `template-sites.json`
- `render-hosting.json`
- related logs, sessions, checkout orders, payments, env/disk/domain metadata still stored there

Replace in-memory intake sessions with project/plan state.

## 8. Migration utility

Create commands such as:

```text
npm run migrate:builder-json -- --dry-run
npm run migrate:builder-json -- --execute
npm run migrate:builder-json -- --verify
```

The command must read configured `DATA_DIR`, never modify source files, create backup manifest/checksums, safely parse, report corruption, map ownership, generate deterministic legacy keys, upsert idempotently, verify relationships, write machine-readable results, and fail nonzero on blocking integrity issues.

## 9. Suggested legacy mapping

### Site plan

```text
legacy planId -> project metadata.legacyPlanId
brief/sitemap/wireframe/style -> planJson
answerSheet -> answerSheetJson
siteId/deploymentId -> deployment link lookup
status -> canonical state mapping
```

### Tailored site

```text
legacy siteId -> revision metadata.legacySiteId
answers -> answer sheet/metadata
pages/generatedSite -> generatedSiteJson/artifact metadata
status -> revision status
```

### Hosting deployment

```text
legacy deploymentId -> canonical deployment ID
userId -> owner
siteId/projectId -> project/revision lookup
logs -> event rows
checkout/payment/subscription -> canonical billing records
```

## 10. Cutover

Preferred sequence:

1. Deploy tables disabled.
2. New API writes database under flag.
3. Legacy reads adapt to project responses.
4. Migrate history.
5. Enable database reads for selected users.
6. Compare.
7. Enable all users.
8. Stop legacy creation.
9. Stop legacy writes.
10. Keep read-only fallback during observation.
11. Archive/remove later.

Avoid indefinite dual-write.

## 11. SQLite considerations

SQLite is acceptable for current single-node launch if transactions, WAL/busy timeout, short job leases, indexes, persistent database path, and tested backups are used. Document a future Postgres trigger such as multiple API/worker instances or sustained write contention.

## 12. Backup and rollback

Before migration, copy database and JSON stores and record checksums/app/migration versions. Rollback must restore prior DB and feature flags without deleting provider resources created after migration. Retain backups through the production observation window.
