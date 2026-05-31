# Mountain 02 — Unzip and Detect

One job: safely extract the ZIP, detect the project, write the build script.

## Owns
- ZIP entry extraction (AdmZip)
- Ignore rules: node_modules, .git, .env, __MACOSX, caches, IDE folders
- Unsafe script filter (.sh .bat .cmd .ps1) — EXCEPT glondia-render-build.sh
- Root-prefix flattening (all files share one top-level folder)
- Deployable file count limits (max 5000)
- Per-entry size limits (max 25 MB)
- Path traversal protection
- Framework detection: Vite, Next, CRA, Gatsby, Vue, Svelte, Astro, Remix, Node, static
- Build command / publish directory / start command resolution
- glondia-render-build.sh generation (per detected framework)
- glondia-upload-artifact.json manifest

## Source files (current)
- services/zipExtractor.js
- services/projectDetector.js
- services/buildScriptWriter.js
- services/zipSiteDeployment.service.js  (extraction + detection combined)

## Target files (future)
- zipExtractor.stage.js         Safe extraction with filtering
- zipCleaner.stage.js           Root prefix strip, ignore rules
- projectDetector.stage.js      Framework detection
- buildScriptWriter.stage.js    Generate glondia-render-build.sh per type

## Context out
{ source.files[], source.ignoredFiles[], source.localDir, source.manifestPath,
  project.framework, project.serviceType, project.buildCommand,
  project.publishDirectory, project.startCommand, project.nodeVersion }
