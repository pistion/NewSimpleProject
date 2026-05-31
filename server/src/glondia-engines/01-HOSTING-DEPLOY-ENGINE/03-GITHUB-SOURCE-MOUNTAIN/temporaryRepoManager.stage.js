/**
 * temporaryRepoManager.stage.js
 *
 * Opt-in temporary GitHub repo support for source handoff to Render.
 * The default generated-sites repo flow remains the normal path.
 */

import { publishDirectoryToGithub, parseGithubRepoUrl } from './githubPublisher.stage.js';

const TEMPORARY_MODE_VALUES = new Set(['temporary', 'temp', 'temporary_repo', 'temporary-repo']);

export function shouldUseTemporaryRepo(input = {}) {
  const mode = input.sourceRepoMode || input.repositoryMode || input.repoMode || input.githubMode;
  return TEMPORARY_MODE_VALUES.has(String(mode || '').trim().toLowerCase());
}

export function makeTemporaryRepoName(slug = 'site') {
  const safeSlug = String(slug || 'site')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'site';
  return `glondia-${safeSlug}-${Date.now().toString(36)}`.slice(0, 80);
}

export async function publishDirectoryToTemporaryRepo({
  directory,
  slug,
  branch = 'main',
  token,
  owner,
  name,
  privateRepo = true,
  description,
}) {
  const repo = await createTemporaryGithubRepo({
    owner,
    name: name || makeTemporaryRepoName(slug),
    token,
    privateRepo,
    description: description || `Temporary Glondia Render source for ${slug || 'site'}`,
  });
  const githubPublish = await publishDirectoryToGithub({
    directory,
    targetRoot: '',
    repoUrl: repo.repoUrl,
    branch: repo.branch || branch,
    token,
  });
  const normalizedPublish = {
    ...githubPublish,
    attempted: true,
    repository: githubPublish.repo,
    publishedCount: githubPublish.published?.length || 0,
  };
  return {
    ...repo,
    targetRoot: '',
    branch: normalizedPublish.branch || repo.branch || branch,
    githubPublish: normalizedPublish,
  };
}

export async function createTemporaryGithubRepo({ owner, name, token, privateRepo = true, description = '' }) {
  assertUsableToken(token);
  const body = {
    name,
    private: Boolean(privateRepo),
    description,
    auto_init: false,
  };

  const attempts = owner
    ? [`https://api.github.com/orgs/${encodeURIComponent(owner)}/repos`, 'https://api.github.com/user/repos']
    : ['https://api.github.com/user/repos'];

  let lastError = null;
  for (const url of attempts) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      const data = await response.json();
      return {
        repoUrl: data.html_url,
        fullName: data.full_name,
        owner: data.owner?.login,
        name: data.name,
        branch: data.default_branch || 'main',
        private: data.private,
        archived: data.archived,
      };
    }
    const text = await response.text().catch(() => '');
    lastError = stageError(`Temporary GitHub repo creation failed ${response.status}: ${text}`, 'github_temp_repo_create', response.status);
    if (!owner || ![403, 404].includes(response.status)) break;
  }
  throw lastError || stageError('Temporary GitHub repo creation failed.', 'github_temp_repo_create', 502);
}

export async function archiveGithubRepo({ repoUrl, token }) {
  assertUsableToken(token);
  const parsed = parseGithubRepoUrl(repoUrl);
  if (!parsed) throw stageError('Invalid temporary GitHub repository URL.', 'github_temp_repo_archive', 400);
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`, {
    method: 'PATCH',
    headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ archived: true }),
  });
  if (!response.ok) {
    throw stageError(`Temporary GitHub repo archive failed ${response.status}: ${await response.text().catch(() => '')}`, 'github_temp_repo_archive', response.status);
  }
  return response.json();
}

function assertUsableToken(token) {
  if (!String(token || '').trim()) {
    throw stageError('A GitHub token is required to create a temporary repository.', 'github_temp_repo_create', 409);
  }
  if (String(token).includes('-----BEGIN')) {
    throw stageError('Temporary repository creation requires a GitHub PAT. Use the generated-sites flow for GitHub App private keys.', 'github_temp_repo_create', 409);
  }
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'glondiasites-render-deploy-lab',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function stageError(message, stage, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.stage = stage;
  error.expose = true;
  return error;
}
