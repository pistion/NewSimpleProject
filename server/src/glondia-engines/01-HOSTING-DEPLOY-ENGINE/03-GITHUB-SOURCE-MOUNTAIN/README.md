# Mountain 03 — GitHub Source

One job: push the extracted source to the generated-sites GitHub repo.
Temporary single-site repos are also supported as an explicit opt-in.

## Owns
- GitHub repo URL parsing (HTTPS, SSH, shorthand)
- Token resolution: GITHUB_GENERATED_SITES_TOKEN → GITHUB_TOKEN
- GitHub App private key → installation token exchange (githubAppAuth)
- Pre-flight repo/branch access check
- File-by-file upsert (SHA lookup + PUT) with URL-encoded paths
- Permission error early abort
- Root dispatcher script at repo root (glondia-render-build.sh)
- targetRoot = base_dir / site_slug (always includes slug)
- Opt-in temporary repo mode: repoMode/sourceRepoMode/repositoryMode/githubMode = temporary

## Source files (current)
- services/githubPublisher.js
- services/githubGeneratedSitePublisher.service.js
- services/githubAppAuth.js
- services/runtimeConfig.js

## Target files
- githubRepoParser.stage.js                URL parsing + validation
- githubRepoValidator.stage.js             Pre-flight access check
- githubPublisher.stage.js                 File upsert loop
- githubAppAuth.stage.js                   App key → installation token
- generatedSitesRepoPublisher.stage.js     Full generated-sites publish flow
- temporaryRepoManager.stage.js            Create/archive opt-in temp repos

## Required env vars
RENDER_GENERATED_SITES_REPO_URL
GITHUB_GENERATED_SITES_TOKEN  (preferred — fine-grained PAT)
GITHUB_TOKEN                  (fallback — may be RSA private key)
GITHUB_CLIENT_ID              (required when GITHUB_TOKEN is App key)
RENDER_GENERATED_SITES_ROOT_DIR  (default: uploaded-sites)

## Temporary repo mode
Set any request field below to `temporary`, `temp`, `temporary_repo`, or `temporary-repo`:
- repoMode
- sourceRepoMode
- repositoryMode
- githubMode

Optional fields:
- temporaryRepoOwner / githubOwner
- temporaryRepoName
- temporaryRepoPrivate (default: true)

Temporary repo creation requires a GitHub PAT. GitHub App private keys stay supported by the generated-sites repo flow.

## Context out
{ github.repoUrl, github.branch, github.targetRoot, github.publishedCount, github.errors[] }
