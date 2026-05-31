# Mountain 06 — Preview

One job: serve the tailored HTML for preview, collect revisions.

## Owns
- Preview iframe HTML serving
- Multi-page preview (page index navigation)
- Revision request collection
- Loop back to AI Refinement if changes requested

## Source files (current)
- controllers/template-ai.controller.js  previewSite()
- services/templateSiteStore.js
- routes/template-ai.routes.js  GET /sites/:siteId/preview

## Public URL (do not change)
GET /api/template-ai/sites/:siteId/preview

## Target files (future)
- previewBuilder.stage.js    Render HTML for iframe
- previewServer.stage.js     Serve preview endpoint
- revisionLoop.stage.js      Collect + apply revision requests
