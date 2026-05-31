# 01 — Hosting Deploy Engine

User already has source code. ZIP upload or GitHub repo → deployed on Render.

## The six mountains

```
01-ZIP-INTAKE-MOUNTAIN/
  Job: Receive the ZIP. Validate size and type. Create deploymentId.
       Create working directory. Write initial deployment record.
  Output: { deploymentId, zipBuffer, workDir, fileName, userId }

02-UNZIP-AND-DETECT-MOUNTAIN/
  Job: Extract ZIP safely. Filter ignored folders/files. Detect framework.
       Write glondia-render-build.sh. Write manifest.
  Output: { source.files[], source.localDir, project.framework, project.buildCommand, ... }

03-GITHUB-SOURCE-MOUNTAIN/
  Job: Resolve GitHub token (PAT or App key exchange).
       Validate repo and branch. Publish extracted source to targetRoot.
       Return published file count and any errors.
  Output: { github.repoUrl, github.targetRoot, github.publishedCount, github.errors[] }

04-RENDER-PAYLOAD-MOUNTAIN/
  Job: Build the exact JSON payload Render needs.
       Static site payload OR web service payload.
       Attach env vars, disk, health check, GLONDIA_SITE_SLUG.
  Output: { render.payload }

05-RENDER-DEPLOY-MOUNTAIN/
  Job: Create Render service. Trigger deploy. Record serviceId + deployId.
       Write status + liveUrl to hosting store. Stream logs if requested.
  Output: { render.serviceId, render.deployId, render.liveUrl, render.status }

06-CLEANUP-MOUNTAIN/
  Job: Remove local working directory.
       On failure: partial cleanup, preserve logs.
       On success: clear temp files, keep manifest for redeploy reference.
  Output: { cleanup.localDirRemoved, cleanup.reason }
```

## Pipelines

```
pipelines/
  zipToRender.pipeline.js         Stage 01 → 02 → 03 → 04 → 05 → 06
  githubLinkToRender.pipeline.js  Skips 01/02 — straight to 03 → 04 → 05
```

## Public entry points (do not change URLs)

```
POST /api/deployments/zip      → zipToRender.pipeline
POST /api/deployments/github   → githubLinkToRender.pipeline
POST /api/deployments/render   → githubLinkToRender.pipeline (repo already known)
POST /api/deploy/zip           → zipToRender.pipeline (compat alias)
POST /api/deploy/github        → githubLinkToRender.pipeline (compat alias)
POST /api/template-ai/zip/deploy → zipToRender.pipeline (template-ai compat alias)
```

## Migration status

### Mountains
- [ ] 01-ZIP-INTAKE-MOUNTAIN
- [ ] 02-UNZIP-AND-DETECT-MOUNTAIN
- [ ] 03-GITHUB-SOURCE-MOUNTAIN
- [ ] 04-RENDER-PAYLOAD-MOUNTAIN
- [ ] 05-RENDER-DEPLOY-MOUNTAIN
- [ ] 06-CLEANUP-MOUNTAIN

### Pipelines
- [ ] zipToRender.pipeline.js
- [ ] githubLinkToRender.pipeline.js

### Routes / Controller
- [ ] routes/hostingDeploy.routes.js
- [ ] controllers/hostingDeploy.controller.js

### Adapters (wrappers keeping old imports alive)
- [ ] adapters/legacyDeploymentRoutes.adapter.js
- [ ] adapters/templateAiZipRoute.adapter.js
