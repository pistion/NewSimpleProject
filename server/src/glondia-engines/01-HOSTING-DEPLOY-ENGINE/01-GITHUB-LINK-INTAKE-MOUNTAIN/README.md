# Mountain 01G - GitHub Link Intake

One job: normalize a GitHub repository URL for direct Render deployment.

This path does not unzip, copy, or publish source. Render receives the user's
GitHub repository directly.

## Owns
- repoUrl/repositoryUrl/sourceRepository/sourceReference normalization
- GitHub URL validation
- branch fallback
- site/service name fallback from repository name

## Files
- githubLink.intake.js

## Output
{ repoUrl, parsedRepo, branch, siteName, sourceReference, userId, siteId, projectId }
