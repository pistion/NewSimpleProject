# Mountain 04 — Render Payload

One job: build the exact JSON payload Render needs to create a service.

## Owns
- Static site payload: buildCommand, publishPath, pullRequestPreviewsEnabled
- Web service payload: env/runtime, plan, region, envSpecificDetails, disk, healthCheckPath
- rootDir = targetRoot (always — so glondia-render-build.sh is found)
- autoDeploy = 'no' (always — prevents mid-push builds)
- GLONDIA_SITE_SLUG env var always injected (root dispatcher fallback)
- User env vars merged with system vars
- Persistent disk shape validation
- cleanObject strips empty strings and undefined from payload

## Source files (current)
- services/renderApiService.js  (buildServicePayload method)
- services/zipSiteDeployment.service.js  (createService arguments)
- services/zipDeploymentService.js  (buildRenderInput helper)
- services/githubDeploymentService.js  (service creation args)

## Target files (future)
- renderPayloadBuilder.stage.js    Top-level payload assembly + cleanObject
- staticSitePayload.stage.js       Static site serviceDetails builder
- webServicePayload.stage.js       Web service serviceDetails builder
- envVarsPayload.stage.js          Merge GLONDIA_SITE_SLUG + user envVars
- diskPayload.stage.js             Disk shape: name, mountPath, sizeGB
- domainPayload.stage.js           (future) Custom domain pre-configuration

## Context out
{ render.payload }
