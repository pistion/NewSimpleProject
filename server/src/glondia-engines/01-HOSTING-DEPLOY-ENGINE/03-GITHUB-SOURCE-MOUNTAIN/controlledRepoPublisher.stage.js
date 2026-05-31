/**
 * controlledRepoPublisher.stage.js — 03-GITHUB-SOURCE-MOUNTAIN
 *
 * Creates and publishes to a GLONDIASITES-CONTROLLED GitHub repo. This is the
 * write side of the controlled-source pipeline and the ONLY repo Render is
 * allowed to deploy from.
 *
 *   create controlled repo (Mode A: new repo per deployment)
 *   → publish local source to repo root
 *   → return controlled repo URL + commit SHA + branch
 *
 * Builds on githubPublisher (file upload) and mirrors temporaryRepoManager's
 * repo-creation approach, but authenticates with the platform GitHub App
 * installation token instead of requiring a raw PAT.
 */

import { publishDirectoryToGithub, parseGithubRepoUrl } from './githubPublisher.stage.js';
import {
  getInstallationTokenForOwner,
  getInstallationTokenForRepo,
  getPlatformInstallationToken,
  githubAppConfigured,
} from './githubAppAuth.stage.js';
import { hasRealValue, normalizeRoot } from '../../00-SHARED/runtimeConfig.js';

const DEFAULT_PREFIX = 'glondia-site';

/**
 * Resolve the token used to create/manage controlled repos.
 * Prefers the platform GitHub App installation token (explicit id → known
 * controlled repo → owner lookup), then falls back to a PAT.
 */
export async function resolveControlledRepoToken() {
  if (githubAppConfigured()) {
    if (process.env.GITHUB_GLONDIASITES_INSTALLATION_ID) {
      try { return await getPlatformInstallationToken(); } catch { /* fall through */ }
    }
    const knownRepo = parseGithubRepoUrl(process.env.RENDER_GENERATED_SITES_REPO_URL || '');
    if (knownRepo) {
      try { return await getInstallationTokenForRepo({ owner: knownRepo.owner, repo: knownRepo.repo }); } catch { /* fall through */ }
    }
    const owner = process.env.GITHUB_GLONDIASITES_OWNER || knownRepo?.owner;
    if (owner) {
      try { return await getInstallationTokenForOwner(owner); } catch { /* fall through */ }
    }
  }
  const pat = process.env.GITHUB_GENERATED_SITES_TOKEN || process.env.GITHUB_TOKEN || '';
  if (hasRealValue(pat) && !pat.includes('-----BEGIN')) return pat;
  throw stageError(
    'No GitHub credential available for controlled-repo publishing. Configure the GitHub App (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY) installed on the controlled owner, or a GITHUB_GENERATED_SITES_TOKEN PAT.',
    'controlled_repo_create',
    409,
  );
}

/**
 * Build a stable, unique controlled repo name.
 *   glondia-site-<safe-site-name>-<short-id>
 */
export function makeControlledRepoName({ siteName, userId } = {}) {
  const prefix = (process.env.GITHUB_CONTROLLED_REPO_PREFIX || DEFAULT_PREFIX)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || DEFAULT_PREFIX;
  const safeSite = String(siteName || 'site')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'site';
  const userPart = userId
    ? `${String(userId).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 6)}-`
    : '';
  const shortId = Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5);
  return `${prefix}-${userPart}${safeSite}-${shortId}`.slice(0, 90);
}

/**
 * Create a new Glondiasites-controlled GitHub repo under the platform owner.
 */
export async function createControlledGithubRepo({ owner, name, privateRepo = true, description = '', token }) {
  if (!hasRealValue(token)) throw stageError('A GitHub token is required to create a controlled repo.', 'controlled_repo_create', 409);
  const body = {
    name,
    private: Boolean(privateRepo),
    description: description || `Glondiasites controlled deploy source: ${name}`,
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
      };
    }
    const text = await response.text().catch(() => '');
    lastError = stageError(`Controlled GitHub repo creation failed ${response.status}: ${text}`, 'controlled_repo_create', response.status);
    // Only fall through to the user namespace when the org attempt was a perms/404 issue.
    if (!owner || ![403, 404].includes(response.status)) break;
  }
  throw lastError || stageError('Controlled GitHub repo creation failed.', 'controlled_repo_create', 502);
}

/**
 * Publish a local directory into the controlled repo root and capture the commit.
 */
export async function publishDirectoryToControlledRepo({ directory, repoUrl, branch = 'main', token }) {
  const publish = await publishDirectoryToGithub({
    directory,
    targetRoot: '',
    repoUrl,
    branch,
    token,
  });
  return {
    ...publish,
    publishedCount: publish.published?.length || 0,
    commitId: publish.commitId || null,
  };
}

/**
 * High-level helper used by the pipeline: publish imported source into a
 * Glondiasites-controlled repo and return the metadata Render needs.
 *
 * Mode A — dedicated repo per deployment (preferred). Requires the credential
 *          to be able to create repos under the controlled owner.
 * Mode B — fallback to a per-site subdirectory inside the shared controlled
 *          repo (RENDER_GENERATED_SITES_REPO_URL) when repo creation is not
 *          permitted (e.g. GitHub App installation token on a user account).
 *
 * In both modes Render only ever sees the Glondiasites-controlled repo.
 *
 * @returns {{ mode, controlledRepoUrl, controlledFullName, branch, rootDirectory,
 *             commitId, publishedCount, private, createdAt }}
 */
export async function publishToControlledRepo({ localDir, siteName, userId, owner, privateRepo = true, branch = 'main', token }) {
  const repoOwner = owner || process.env.GITHUB_GLONDIASITES_OWNER || '';
  const usePrivate = resolvePrivate(privateRepo);
  const activeToken = token || (await resolveControlledRepoToken());
  const name = makeControlledRepoName({ siteName, userId });

  // ── Mode A: dedicated repo per deployment ──────────────────────────────────
  let repo = null;
  try {
    repo = await createControlledGithubRepo({
      owner: repoOwner,
      name,
      privateRepo: usePrivate,
      token: activeToken,
    });
  } catch (error) {
    // 403 (integration cannot create repos) / 404 (owner is not an org) → Mode B.
    if (![403, 404].includes(error.status)) throw error;
  }

  if (repo) {
    const publish = await publishDirectoryToControlledRepo({
      directory: localDir,
      repoUrl: repo.repoUrl,
      branch: repo.branch || branch,
      token: activeToken,
    });
    return {
      mode: 'dedicated-repo',
      controlledRepoUrl: repo.repoUrl,
      controlledFullName: repo.fullName,
      branch: publish.branch || repo.branch || branch,
      rootDirectory: '',
      commitId: publish.commitId || null,
      publishedCount: publish.publishedCount,
      private: repo.private,
      createdAt: new Date().toISOString(),
    };
  }

  // ── Mode B: subdirectory in the shared controlled repo ─────────────────────
  const sharedRepoUrl = process.env.RENDER_GENERATED_SITES_REPO_URL || '';
  const sharedParsed = parseGithubRepoUrl(sharedRepoUrl);
  if (!sharedParsed) {
    throw stageError(
      'Dedicated controlled-repo creation is not permitted for this GitHub account, and RENDER_GENERATED_SITES_REPO_URL is not configured for the shared controlled-repo fallback.',
      'controlled_repo_create',
      409,
    );
  }
  const rootBase = normalizeRoot(process.env.RENDER_GENERATED_SITES_ROOT_DIR || 'uploaded-sites');
  const rootDirectory = `${rootBase}/${name}`.replace(/^\/+/, '');

  const publish = await publishDirectoryToGithub({
    directory: localDir,
    targetRoot: rootDirectory,
    repoUrl: sharedRepoUrl,
    branch,
    token: activeToken,
  });

  return {
    mode: 'shared-repo',
    controlledRepoUrl: sharedParsed.url || `https://github.com/${sharedParsed.owner}/${sharedParsed.repo}`,
    controlledFullName: `${sharedParsed.owner}/${sharedParsed.repo}`,
    branch: publish.branch || branch,
    rootDirectory,
    commitId: publish.commitId || null,
    publishedCount: publish.published?.length || 0,
    private: usePrivate,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Archive (soft-retire) a controlled repo.
 */
export async function archiveControlledRepo({ repoUrl, token }) {
  const activeToken = token || (await resolveControlledRepoToken());
  const parsed = parseGithubRepoUrl(repoUrl);
  if (!parsed) throw stageError('Invalid controlled GitHub repository URL.', 'controlled_repo_archive', 400);
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`, {
    method: 'PATCH',
    headers: { ...githubHeaders(activeToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ archived: true }),
  });
  if (!response.ok) {
    throw stageError(`Controlled GitHub repo archive failed ${response.status}: ${await response.text().catch(() => '')}`, 'controlled_repo_archive', response.status);
  }
  return response.json();
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function resolvePrivate(privateRepo) {
  if (privateRepo === false) return false;
  if (privateRepo === true) return true;
  const env = process.env.GITHUB_CONTROLLED_REPO_PRIVATE;
  if (env === 'false') return false;
  return true;
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
