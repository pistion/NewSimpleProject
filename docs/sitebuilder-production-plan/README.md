# NewSimpleProject SiteBuilder Production Implementation Pack

Repository: `pistion/NewSimpleProject`  
Audited baseline commit: `4f90ab3965e04db716f31a629c95ed9521a895f4`  
Primary goal: move the existing SiteBuilder from its current mixed/legacy state to a secure, resumable, database-backed, production-ready workflow without discarding the strong Template AI Engine or Hosting Deploy Engine.

## How to use this pack with Claude Code

1. Open the repository in Claude Code.
2. Attach this entire folder, or place it in the repository under `docs/sitebuilder-production-plan/`.
3. Start with `01_CLAUDE_CODE_MASTER_PROMPT.md`.
4. Tell Claude Code to execute the prompt against the repository, not merely summarize it.
5. Require Claude to work phase by phase, run tests, and produce the final report defined in `14_FINAL_IMPLEMENTATION_REPORT_TEMPLATE.md`.

## Recommended reading order

1. `01_CLAUDE_CODE_MASTER_PROMPT.md`
2. `02_CURRENT_STATE_AND_TARGET_ARCHITECTURE.md`
3. `03_PHASED_IMPLEMENTATION_ROADMAP.md`
4. `04_SECURITY_AND_MALWARE_HARDENING.md`
5. `05_DATABASE_SCHEMA_AND_DATA_MIGRATION.md`
6. `06_BACKEND_API_CONTRACTS_AND_STATE_MACHINE.md`
7. `07_FRONTEND_FLOW_UNIFICATION.md`
8. `08_DURABLE_JOBS_GENERATION_AND_DEPLOYMENT.md`
9. `09_HOSTING_BILLING_AND_PROVIDER_INTEGRATION.md`
10. `10_TESTING_CI_OBSERVABILITY.md`
11. `11_ROLLOUT_MIGRATION_AND_ROLLBACK.md`
12. `12_CURRENT_FILE_PATCH_MAP.md`
13. `13_ACCEPTANCE_AND_DEFINITION_OF_DONE.md`
14. `14_FINAL_IMPLEMENTATION_REPORT_TEMPLATE.md`

## Non-negotiable architectural decisions

- Keep the existing Template AI Engine and Hosting Deploy Engine.
- Do not create another parallel builder architecture.
- Introduce one durable `BuilderProject` lifecycle between the frontend and both engines.
- Store production state in Prisma, not shared JSON files.
- Use durable database-backed jobs for generation, deployment, billing attachment, reconciliation, and cleanup.
- Serve generated previews from an isolated origin, never the authenticated dashboard origin.
- Authenticate and rate-limit every AI endpoint.
- Make generation and deployment idempotent.
- Keep SiteBuilder responsible for preparing projects; keep Hosting responsible for live infrastructure operations.
- Preserve compatibility during migration, then remove legacy paths only after the new flow is proven.
- Fail safely. Never silently fall back to unchanged templates while claiming AI customization succeeded.

## Expected final customer flow

```text
Site Builder
├── Build from template
│   ├── Browse and preview template
│   ├── Create durable project
│   ├── Complete guided plan
│   ├── Review structured answer sheet
│   ├── Generate a revision
│   ├── Safely preview and request changes
│   ├── Approve revision
│   └── Send to Hosting
└── Prepare existing website
    ├── GitHub link or ZIP
    ├── Validate and scan source
    ├── Detect framework and requirements
    ├── Review suggested build settings
    └── Send to Hosting
```

## Important operating rule

Do not blindly apply filenames from this plan. Claude Code must first use repository search (`rg`, file-tree inspection, imports, route mounts, tests) to confirm exact paths and all call sites. The component and service names in this pack are based on the audited repository and are intended as a precise search map.
