# Mountain 05 — Render Deploy

One job: create the service on Render, trigger deploy, record status.

## Owns
- POST /services  → create service from payload, extract serviceId
- POST /services/:id/deploys  → trigger deploy, extract deployId
- Write serviceId, deployId, liveUrl, status to hosting store
- Update deployment record in store
- SSE log stream per deployId

## Source files (current)
- services/renderApiService.js  (createService, triggerDeploy, getDeploy, getDeployLogs)
- services/deploymentStatusService.js
- services/deploymentService.js
- server.js  (/api/deployments/:id/logs/stream SSE handler)

## Target files (future)
- renderServiceCreator.stage.js    Create service, extract serviceId
- renderDeployTrigger.stage.js     Trigger deploy, extract deployId
- renderStatusPoller.stage.js      Poll/refresh status, update store
- renderLogs.stage.js              SSE log stream per deployId

## Context out
{ render.serviceId, render.deployId, render.liveUrl, render.status, render.providerStatus }
