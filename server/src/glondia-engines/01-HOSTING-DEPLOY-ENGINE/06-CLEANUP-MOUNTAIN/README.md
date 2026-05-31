# Mountain 06 — Cleanup

One job: remove local temp files after the pipeline completes.

## Policy
- Success: remove working directory from DATA_DIR/uploaded-sites/
- Failure: preserve working directory for debugging, log reason
- GitHub source: NEVER delete — Render needs it for redeploys
- Default: generated-sites monorepo folders are permanent

## Source files (current)
- services/hostingService.js  delete() removes siteDir
- services/zipSiteDeployment.service.js  (no cleanup currently)

## Target files (future)
- localTempCleanup.stage.js        Remove workDir after success
- failedDeployCleanup.stage.js     Partial cleanup + preserve logs on failure
- temporaryRepoCleanup.stage.js    (future) Archive/remove temp GitHub repos
