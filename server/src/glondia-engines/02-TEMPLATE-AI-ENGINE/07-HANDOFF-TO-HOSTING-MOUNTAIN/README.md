# Mountain 07 — Handoff to Hosting Deploy Engine

One job: package the final source and hand it to Engine 01.

## Owns
- Generate final Vite static site bundle from tailored pages
- Package source into deployable folder
- Call Engine 01 (zipToRender.pipeline or githubLinkToRender.pipeline)
- Return deploymentId + liveUrl to the client
- NO direct Render service creation here — Engine 01 owns that

## Why no direct Render calls here
The Template AI Engine should never contain Render service creation logic.
That belongs to Engine 01. This mountain calls Engine 01 as a black box.

## Source files (current)
- services/staticSiteGenerator.service.js  (generates Vite source)
- controllers/template-ai.controller.js    deploySite() — currently calls Render directly
- services/renderApiService.js             (used directly — REMOVE after migration)

## Target files (future)
- finalSourcePackager.stage.js       Generate Vite bundle from tailored pages
- handoffToHostingDeploy.stage.js    Call Engine 01 pipeline, return deploymentId

## Context out
{ render.serviceId, render.deployId, render.liveUrl, render.status }
