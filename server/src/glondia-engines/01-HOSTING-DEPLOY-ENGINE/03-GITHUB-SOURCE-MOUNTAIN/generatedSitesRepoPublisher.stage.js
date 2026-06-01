import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { getGithubInstallationToken } from './githubAppAuth.stage.js';
import { cleanGithubToken } from '../../00-SHARED/runtimeConfig.js';

const DEFAULT_BRANCH = 'main';

// ── GitHub token resolution ────────────────────────────────────────────────
// Prefers GITHUB_GENERATED_SITES_TOKEN (fine-grained PAT scoped to the
// generated-sites repo). Falls back to GENERATED_SITES_GITHUB_TOKEN then
// GITHUB_TOKEN.  Rejects tokens that look like SSH private keys.

/**
 * Resolve the best available GitHub publisher token from environment.
 * Returns { token, error }.  If error is set, do NOT call GitHub API.
 */
export function resolveGitHubPublisherToken() {
  const raw = cleanGithubToken(
    process.env.GITHUB_GENERATED_SITES_TOKEN ||
    process.env.GENERATED_SITES_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    '',
  );

  if (!raw) {
    return {
      token: '',
      error: 'Missing or invalid GITHUB_GENERATED_SITES_TOKEN. Create a GitHub fine-grained token with contents read/write access to the generated-sites repo.',
    };
  }

  // RSA private keys are GitHub App keys — they require an installation token
  // exchange before use. Flag them here; publishGeneratedSiteToGitHub handles
  // the async exchange.
  if (raw.startsWith('-----BEGIN')) {
    return { token: raw, isAppKey: true, error: null };
  }

  return { token: raw, isAppKey: false, error: null };
}

export function parseGitHubRepoUrl(repoUrl = '') {
  const value = String(repoUrl || '').trim();
  if (!value) return null;

  const ssh = value.match(/^git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/i);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };

  const https = value.match(/^https?:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?\/?$/i);
  if (https) return { owner: https[1], repo: https[2] };

  const shorthand = value.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shorthand) return { owner: shorthand[1], repo: shorthand[2].replace(/\.git$/i, '') };

  return null;
}

export function githubPublisherConfigured(repoUrl = '') {
  const { token, error } = resolveGitHubPublisherToken();
  return Boolean(parseGitHubRepoUrl(repoUrl) && token && !error);
}

/**
 * Verify that the token can access a repo before publishing files.
 * Makes a lightweight GET to the repo metadata endpoint.
 * Returns { ok, error }.
 */
export async function verifyGitHubAccess(repoUrl, resolvedToken) {
  const parsed = parseGitHubRepoUrl(repoUrl);
  if (!parsed) return { ok: false, error: 'Invalid GitHub repository URL.' };

  let token = resolvedToken;
  if (!token) {
    const { token: t, error: tokenError } = resolveGitHubPublisherToken();
    if (tokenError) return { ok: false, error: tokenError };
    token = t;
  }

  try {
    const url = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
    const response = await fetch(url, { headers: githubHeaders(token) });
    if (response.status === 404) {
      return { ok: false, error: `Repository ${parsed.owner}/${parsed.repo} not found — check the repo URL and token scope.` };
    }
    if (response.status === 403) {
      const body = await response.json().catch(() => ({}));
      const msg = body?.message || '';
      if (msg.includes('not accessible by personal access token')) {
        return { ok: false, error: `GitHub token cannot access ${parsed.owner}/${parsed.repo}. The fine-grained PAT needs "Contents: Read and write" permission on this repo. Go to GitHub → Settings → Developer settings → Fine-grained tokens → edit the token → Repository permissions → Contents → Read and write.` };
      }
      return { ok: false, error: `GitHub returned 403 for ${parsed.owner}/${parsed.repo}: ${msg || 'access denied'}. Check token permissions.` };
    }
    if (!response.ok) {
      return { ok: false, error: `GitHub returned ${response.status} for ${parsed.owner}/${parsed.repo}.` };
    }
    // Check push access from the repo permissions object
    const repo = await response.json().catch(() => ({}));
    if (repo.permissions && !repo.permissions.push) {
      return { ok: false, error: `GitHub token has read access to ${parsed.owner}/${parsed.repo} but NOT push/write access. The fine-grained PAT needs "Contents: Read and write" permission.` };
    }
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: `GitHub access check failed: ${err.message}` };
  }
}

export async function publishGeneratedSiteToGitHub({
  siteDir,
  repoUrl,
  branch = DEFAULT_BRANCH,
  targetRoot = '',
  commitMessage = 'Publish generated RoxanneAI site',
}) {
  const parsed = parseGitHubRepoUrl(repoUrl);
  if (!parsed) return { attempted: false, skippedReason: 'No valid GitHub repository URL was provided for generated site publishing.' };

  let { token, isAppKey, error: tokenError } = resolveGitHubPublisherToken();
  if (tokenError) return { attempted: false, skippedReason: tokenError };
  if (!siteDir) return { attempted: false, skippedReason: 'Generated site directory is missing.' };

  // GitHub App private key — exchange for an installation access token first
  if (isAppKey) {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return { attempted: false, skippedReason: 'GITHUB_CLIENT_ID is required when GITHUB_TOKEN is a GitHub App private key.' };
    }
    try {
      token = await getGithubInstallationToken({ clientId, privateKey: token });
    } catch (err) {
      return { attempted: false, skippedReason: `GitHub App token exchange failed: ${err.message}` };
    }
  }

  // Pre-flight: verify the token can access this repo before uploading files
  const accessCheck = await verifyGitHubAccess(repoUrl, token);
  if (!accessCheck.ok) {
    return { attempted: false, skippedReason: accessCheck.error };
  }

  const files = await listFiles(siteDir);
  if (files.length === 0) return { attempted: false, skippedReason: 'Generated site directory contains no files to publish.' };

  const published = [];
  const errors = [];
  const safeRoot = cleanPath(targetRoot);
  let consecutivePermErrors = 0;

  for (const filePath of files) {
    const relativePath = relative(siteDir, filePath).replace(/\\/g, '/');
    const repoPath = cleanPath([safeRoot, relativePath].filter(Boolean).join('/'));

    try {
      const fileBuffer = await readFile(filePath);
      const existingSha = await getExistingFileSha({ ...parsed, path: repoPath, branch, token });
      await putFile({
        ...parsed,
        path: repoPath,
        branch,
        token,
        contentBase64: fileBuffer.toString('base64'),
        sha: existingSha,
        message: `${commitMessage}: ${repoPath}`,
      });
      published.push(repoPath);
      consecutivePermErrors = 0;
    } catch (error) {
      errors.push({ path: repoPath, message: error.message });
      // Abort early on permission errors — no point retrying every file
      if (isPermissionError(error.message)) {
        consecutivePermErrors++;
        if (consecutivePermErrors >= 2) {
          errors.push({
            path: '(aborted)',
            message: `Stopped after ${errors.length} consecutive permission errors. The GitHub token lacks "Contents: Read and write" permission on ${parsed.owner}/${parsed.repo}. Go to GitHub → Settings → Developer settings → Fine-grained tokens → edit the token → Repository permissions → Contents → Read and write.`,
          });
          break;
        }
      }
    }
  }

  return {
    attempted: true,
    repository: `${parsed.owner}/${parsed.repo}`,
    branch,
    targetRoot: safeRoot,
    published,
    publishedCount: published.length,
    errors,
  };
}

/** True when a GitHub error message indicates a token permission problem. */
function isPermissionError(message = '') {
  const lower = (message || '').toLowerCase();
  return lower.includes('not accessible by personal access token')
    || lower.includes('resource not accessible')
    || lower.includes('must have push access')
    || lower.includes('permission');
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function encodeRepoPath(p) {
  return String(p || '').split('/').map(encodeURIComponent).join('/');
}

async function getExistingFileSha({ owner, repo, path, branch, token }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, { headers: githubHeaders(token) });
  if (response.status === 404) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.message || `GitHub lookup failed for ${path}.`);
  return result?.sha || null;
}

async function putFile({ owner, repo, path, branch, token, contentBase64, sha, message }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeRepoPath(path)}`;
  const body = {
    message,
    content: contentBase64,
    branch,
    ...(sha ? { sha } : {}),
  };
  const response = await fetch(url, {
    method: 'PUT',
    headers: githubHeaders(token),
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.message || `GitHub publish failed for ${path}.`);
  return result;
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'GlondiaSites-GeneratedSitePublisher',
  };
}

function cleanPath(value = '') {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
}
