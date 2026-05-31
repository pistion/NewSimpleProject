# 02 — Template AI Engine

User does not have a finished site. Choose template → answer questions → AI tailors it → preview → deploy.
Final deploy always hands off to the Hosting Deploy Engine — no duplicate Render logic here.

## The seven mountains

```
01-TEMPLATE-LIBRARY-MOUNTAIN/
  Job: Serve the template catalog. Search by category. Return metadata.
  Output: { template.templateId, template.name, template.category, template.html }

02-TEMPLATE-SOURCE-MOUNTAIN/
  Job: Fetch the raw template from GitHub or local bundle.
       Resolve version/commit. Copy to workspace.
  Output: { template.templateRepoUrl, template.templatePath, template.workDir }

03-USER-BRIEF-MOUNTAIN/
  Job: Run the questionnaire. Collect answers. Validate required fields.
       Gather assets if supplied.
  Output: { brief: { businessName, industry, audience, offer, tone, colors, ... } }

04-AI-REFINEMENT-MOUNTAIN/
  Job: Build the AI prompt from brief + template. Call OpenAI.
       Clean and validate the returned HTML. Store the prompt for debugging.
  Output: { ai.model, ai.prompt, ai.tailoredPages[], ai.rawResponse }

05-TEMPLATE-EDITING-MOUNTAIN/
  Job: Apply AI output to the template. Map content into pages.
       Toggle features. Inject assets.
       Phase 1: raw HTML replacement.
       Phase 2: manifest-driven field editing.
  Output: { source.pages[], source.editedHtml }

06-PREVIEW-MOUNTAIN/
  Job: Serve the tailored HTML in a preview iframe.
       Collect revision requests. Loop back to AI-Refinement if needed.
  Output: { preview.url, preview.revisionCount }

07-HANDOFF-TO-HOSTING-MOUNTAIN/
  Job: Package final source into a deployable folder.
       Call the Hosting Deploy Engine (zipToRender or githubLinkToRender).
       Return deploymentId + liveUrl to the client.
  Output: { render.serviceId, render.deployId, render.liveUrl, render.status }
```

## Pipelines

```
pipelines/
  templateToPreview.pipeline.js   Mountains 01 → 02 → 03 → 04 → 05 → 06
  templateToDeploy.pipeline.js    Preview approved → 07 → Hosting Deploy Engine
```

## Public entry points (do not change URLs)

```
GET  /api/template-ai/settings
POST /api/template-ai/intake/start
POST /api/template-ai/intake/message
POST /api/template-ai/generate
POST /api/template-ai/sites
GET  /api/template-ai/sites/:siteId
GET  /api/template-ai/sites/:siteId/preview
POST /api/template-ai/sites/:siteId/deploy
GET  /api/template-ai/templates/:templateId/preview
```

## Migration status

### Mountains
- [ ] 01-TEMPLATE-LIBRARY-MOUNTAIN
- [ ] 02-TEMPLATE-SOURCE-MOUNTAIN
- [ ] 03-USER-BRIEF-MOUNTAIN
- [ ] 04-AI-REFINEMENT-MOUNTAIN
- [ ] 05-TEMPLATE-EDITING-MOUNTAIN
- [ ] 06-PREVIEW-MOUNTAIN
- [ ] 07-HANDOFF-TO-HOSTING-MOUNTAIN

### Pipelines
- [ ] templateToPreview.pipeline.js
- [ ] templateToDeploy.pipeline.js

### Routes / Controller / Store
- [ ] routes/templateAi.routes.js
- [ ] controllers/templateAi.controller.js
- [ ] store/templateSiteStore.js

### Adapters
- [ ] adapters/legacyTemplateAiRoutes.adapter.js
