# Glondia Engines — Master Map

Two separate engines. One shared backbone. Clear mountains. No broken routes.

---

## How to read this map

Each engine is made of numbered mountains.
Each mountain owns one job.
Each stage inside a mountain does one thing.
If something breaks, you know exactly which mountain to open.

```
glondia-engines/
  00-SHARED/                        ← Common tools both engines use
  01-HOSTING-DEPLOY-ENGINE/         ← User has source code: ZIP or GitHub → Render
  02-TEMPLATE-AI-ENGINE/            ← User needs a site: Template + AI → source → Render
```

---

## Engine 01 — Hosting Deploy Engine

**Who uses it:** A client who already has a website or app source.
**Input:** ZIP file upload OR GitHub repo link
**Output:** Live Render deployment + status/logs

```
01-ZIP-INTAKE-MOUNTAIN/             Receive + validate the ZIP. Create deployment record.
02-UNZIP-AND-DETECT-MOUNTAIN/       Extract safely. Detect framework. Write build script.
03-GITHUB-SOURCE-MOUNTAIN/          Push source to generated-sites repo on GitHub.
04-RENDER-PAYLOAD-MOUNTAIN/         Build the exact payload Render needs.
05-RENDER-DEPLOY-MOUNTAIN/          Create service on Render. Trigger deploy. Stream logs.
06-CLEANUP-MOUNTAIN/                Clean up local temp files after success or failure.

pipelines/                          End-to-end orchestrators that chain the mountains.
  zipToRender.pipeline.js           ZIP → unzip → GitHub → Render
  githubLinkToRender.pipeline.js    GitHub repo URL → GitHub → Render

routes/
  hostingDeploy.routes.js           All /api/deployments/* and /api/deploy/* routes live here

controllers/
  hostingDeploy.controller.js       Thin controller — calls pipeline, returns result

adapters/
  legacyDeploymentRoutes.adapter.js Old deploymentRoutes.js re-exports from here
  templateAiZipRoute.adapter.js     Old /api/template-ai/zip/deploy re-exports from here
```

### Current files → future home

| Current file | Future location |
|---|---|
| `services/zipDeploymentService.js` | `pipelines/zipToRender.pipeline.js` |
| `services/githubDeploymentService.js` | `pipelines/githubLinkToRender.pipeline.js` |
| `services/zipExtractor.js` | `02-UNZIP-AND-DETECT-MOUNTAIN/zipExtractor.stage.js` |
| `services/projectDetector.js` | `02-UNZIP-AND-DETECT-MOUNTAIN/projectDetector.stage.js` |
| `services/buildScriptWriter.js` | `02-UNZIP-AND-DETECT-MOUNTAIN/buildScriptWriter.stage.js` |
| `services/githubPublisher.js` | `03-GITHUB-SOURCE-MOUNTAIN/githubPublisher.stage.js` |
| `services/githubGeneratedSitePublisher.service.js` | `03-GITHUB-SOURCE-MOUNTAIN/generatedSitesRepoPublisher.stage.js` |
| `services/githubAppAuth.js` | `03-GITHUB-SOURCE-MOUNTAIN/githubAppAuth.stage.js` |
| `services/zipSiteDeployment.service.js` | split across mountains + pipeline |
| `routes/deploymentRoutes.js` | `routes/hostingDeploy.routes.js` (keep wrapper) |
| `controllers/deploymentController.js` | `controllers/hostingDeploy.controller.js` (keep wrapper) |

---

## Engine 02 — Template AI Engine

**Who uses it:** A client who does not have a site yet.
**Input:** Template choice + business answers + AI refinement
**Output:** Tailored site → hands off to Hosting Deploy Engine → Live URL

```
01-TEMPLATE-LIBRARY-MOUNTAIN/       Template catalog. Search. Metadata. Selection.
02-TEMPLATE-SOURCE-MOUNTAIN/        Fetch template from GitHub. Copy to workspace.
03-USER-BRIEF-MOUNTAIN/             Questionnaire. Business data. Required fields.
04-AI-REFINEMENT-MOUNTAIN/          Build prompt. Call OpenAI. Clean output.
05-TEMPLATE-EDITING-MOUNTAIN/       Apply AI changes. Map content. Toggle features.
06-PREVIEW-MOUNTAIN/                Preview in browser. Collect revisions.
07-HANDOFF-TO-HOSTING-MOUNTAIN/     Package final source. Call Hosting Deploy Engine.

pipelines/
  templateToPreview.pipeline.js     Template + answers → tailored preview
  templateToDeploy.pipeline.js      Preview approved → package → hand to engine 01

routes/
  templateAi.routes.js              All /api/template-ai/* routes live here

controllers/
  templateAi.controller.js          Thin controller — delegates to stages

adapters/
  legacyTemplateAiRoutes.adapter.js Old template-ai.routes.js re-exports from here

store/
  templateSiteStore.js              Persistent draft storage for tailored sites
```

### Current files → future home

| Current file | Future location |
|---|---|
| `routes/template-ai.routes.js` | `routes/templateAi.routes.js` (keep wrapper) |
| `controllers/template-ai.controller.js` | `controllers/templateAi.controller.js` (split into stages) |
| `services/openaiSiteAssistant.service.js` | `04-AI-REFINEMENT-MOUNTAIN/openaiTailor.stage.js` |
| `services/templateSiteStore.js` | `store/templateSiteStore.js` |
| `services/staticSiteGenerator.service.js` | `07-HANDOFF-TO-HOSTING-MOUNTAIN/finalSourcePackager.stage.js` |

---

## 00-SHARED — Common tools

Both engines use these. Never duplicate.

```
deploymentContext.js      The shared context "backpack" passed between stages
deploymentRecordStore.js  Create/update deployment records in the hosting store
stageLogger.js            Consistent start/success/fail logging per stage
stageErrors.js            Standard error shapes (badRequest, stageError, etc.)
stageNames.js             Enum of all stage names (prevents typos)
fileRules.js              ZIP ignore rules, max sizes, unsafe extensions
githubCommon.js           GitHub URL parsing, header builders, token resolution
renderCommon.js           Render payload utilities, status normalisers
runtimeConfig.js          Env var resolution (RENDER_*, GITHUB_*)
```

### Current files → future home

| Current file | Future location |
|---|---|
| `services/deploymentRecordStore.js` | `00-SHARED/deploymentRecordStore.js` |
| `services/runtimeConfig.js` | `00-SHARED/runtimeConfig.js` |

---

## Public routes — never change these URLs

```
POST /api/deployments/zip
POST /api/deployments/github
POST /api/deployments/render
GET  /api/deployments/:id
GET  /api/deployments/:id/status
GET  /api/deployments/:id/logs
GET  /api/deployments/:id/logs/stream

POST /api/deploy/zip
POST /api/deploy/github

GET  /api/template-ai/settings
POST /api/template-ai/intake/start
POST /api/template-ai/intake/message
POST /api/template-ai/generate
POST /api/template-ai/sites
GET  /api/template-ai/sites/:siteId
GET  /api/template-ai/sites/:siteId/preview
POST /api/template-ai/sites/:siteId/deploy
GET  /api/template-ai/zip/settings
POST /api/template-ai/zip/deploy
POST /api/template-ai/zip/validate
GET  /api/template-ai/templates/:templateId/preview
```

These are served by adapter files that proxy to the new engine routes.
Old route files are kept as thin re-exports until all callers are migrated.

---

## Stage function standard

Every stage follows the same pattern:

```js
export async function runStage(context) {
  context.currentStage = 'stage_name';
  try {
    // Read from context. Do one job. Write result back.
    return context;
  } catch (error) {
    error.stage = 'stage_name';
    throw error;
  }
}
```

---

## Shared context object — the backpack

```js
{
  deploymentId: 'dep_xxx',
  sourceType: 'zip | github | template',
  currentStage: 'zip_extract',
  userId: 'local-user',
  input: {},
  source: { localDir, repoUrl, branch, rootDir, files: [] },
  project: { framework, serviceType, buildCommand, publishDirectory, startCommand },
  template: { templateId, templateRepoUrl, templatePath, selectedVersion },
  brief: {},
  ai: { model, prompt, tailoredPages: [] },
  github: { targetRepo, targetRoot, publishedCount: 0, errors: [] },
  render: { payload, serviceId, deployId, liveUrl, status },
  logs: []
}
```

---

## Migration order

```
Phase 0  Skeleton + this README (no code changes)               DONE
Phase 1  00-SHARED utilities and context object                  DONE
Phase 2  02-UNZIP-AND-DETECT-MOUNTAIN (zipExtractor, detector, buildScript) DONE
Phase 3  03-GITHUB-SOURCE-MOUNTAIN (publishers, appAuth)         DONE
Phase 4  04-RENDER-PAYLOAD-MOUNTAIN + 05-RENDER-DEPLOY-MOUNTAIN DONE
Phase 5  Hosting Deploy pipelines (zipToRender, githubLinkToRender) DONE (compat orchestrators)
Phase 6  02-TEMPLATE-AI-ENGINE stages and controller split       DONE (stage homes + route/controller bridge)
Phase 7  Template deploy handoff to Hosting Deploy Engine        DONE (GitHub publish before Render)
Phase 8  Optional: temporary repo support                       DONE (opt-in repoMode/sourceRepoMode=temporary)
```

One PR per phase. Run route tests after each phase. Never delete old files until nothing imports them.
