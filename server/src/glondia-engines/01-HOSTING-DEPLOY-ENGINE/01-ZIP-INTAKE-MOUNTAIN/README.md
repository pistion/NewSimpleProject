# Mountain 01 — ZIP Intake

One job: receive the ZIP, validate it, create the deployment record.

## Owns
- Multipart file handling (field names: zip, file, siteZip)
- ZIP size validation (max 100 MB by default)
- File type check (.zip only)
- deploymentId + workDir creation
- Initial deployment record (status: preparing)

## Source files (current)
- routes/deploymentRoutes.js        multer config
- routes/template-ai.routes.js      multer config (siteZip field)
- services/zipDeploymentService.js  buffer validation
- services/zipSiteDeployment.service.js  base64 decode + size check

## Target files (future)
- zipUpload.intake.js        Multer config + size/type validation
- zipUpload.validators.js    Buffer safety checks, deployable entry check

## Context out
{ deploymentId, workDir, fileName, zipBuffer, userId, input }
