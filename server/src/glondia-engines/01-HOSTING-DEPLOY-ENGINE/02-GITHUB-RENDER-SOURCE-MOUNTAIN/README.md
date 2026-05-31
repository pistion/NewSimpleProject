# Mountain 02G - GitHub Render Source

One job: convert the normalized GitHub link into the source object Render needs.

## Owns
- sourceType = github-link
- repoUrl/repositoryUrl/sourceReference
- branch
- parsed owner/repo metadata for logs and records

## Files
- githubRenderSource.stage.js

## Output
{ sourceType, repoUrl, repositoryUrl, sourceReference, branch, owner, repo, fullName }
