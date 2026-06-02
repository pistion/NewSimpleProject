/**
 * githubPublisher.stage.js - 03-GITHUB-SOURCE-MOUNTAIN
 *
 * Publishes extracted source folders into the generated-sites GitHub repo.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { hasRealValue, cleanGithubToken } from '../../00-SHARED/runtimeConfig.js';
import { getGithubInstallationToken } from './githubAppAuth.stage.js';

export function parseGithubRepoUrl(url) {
  const match = String(url || '').trim().match(/github\.com[:/]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/?#].*)?$/i);
  if (!match) return null;
  const owner = match[1].trim();
  const repo = match[2].trim().replace(/\.git$/i, '');
  if (!owner || !repo || repo === '.' || repo === '..') return null;
  return { owner, repo };
}

/**
 * Publish a local directory into a GitHub repo. By default this uses the Git
 * Data (Trees) API so ALL files land in a single atomic commit — no per-file
 * commit storm, no partial-publish failures, far fewer API calls. Set
 * GITHUB_PUBLISH_MODE=contents to force the legacy per-file Contents API path.
 * If tree publishing throws, it falls back to the Contents API automatically.
 */
export async function publishDirectoryToGithub({ directory, targetRoot, repoUrl, branch = 'main', token, rootDispatcher, message }) {
  const parsed = parseGithubRepoUrl(repoUrl);
  if (!parsed) throw stageError('Invalid generated-sites GitHub repository URL.', 'github_repo_validate', 400);
  if (!hasRealValue(token)) throw stageError('GITHUB_GENERATED_SITES_TOKEN or GITHUB_TOKEN is required to publish ZIP source files.', 'github_push', 409);

  if (isRsaPrivateKey(token)) {
    const appId = process.env.GITHUB_APP_ID;
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!appId && !clientId) throw stageError('GITHUB_APP_ID is required when GITHUB_GENERATED_SITES_TOKEN or GITHUB_TOKEN is a GitHub App private key.', 'github_push', 409);
    token = await getGithubInstallationToken({ appId, clientId, privateKey: token, owner: parsed.owner, repo: parsed.repo });
  }

  const ctx = { directory, targetRoot, owner: parsed.owner, repo: parsed.repo, branch, token, rootDispatcher, message };

  if (String(process.env.GITHUB_PUBLISH_MODE || '').toLowerCase() !== 'contents') {
    try {
      return await publishDirectoryToGithubTree(ctx);
    } catch (error) {
      console.warn(`[github-publish] Tree publish failed for ${parsed.owner}/${parsed.repo} — falling back to Contents API: ${error.message}`);
    }
  }
  return publishDirectoryToGithubContentsApi(ctx);
}

/**
 * Atomic publish via the Git Data API: create blobs → one tree → one commit →
 * update the branch ref once. Handles empty repos (no initial commit) by
 * creating a parentless commit and then the branch ref.
 */
export async function publishDirectoryToGithubTree({ directory, targetRoot, owner, repo, branch = 'main', token, rootDispatcher, message }) {
  const files = await walkFiles(directory);
  if (!files.length) throw stageError('No files found to publish to GitHub.', 'github_push', 400);

  // 1. Resolve the current branch ref + base tree (if the branch exists).
  let baseCommitSha = null;
  let baseTreeSha = undefined;
  const refResponse = await fetchWithRetry(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    { headers: githubHeaders(token) },
    `GitHub ref ${branch}`,
  );
  if (refResponse.ok) {
    baseCommitSha = (await refResponse.json())?.object?.sha || null;
    if (baseCommitSha) {
      const commitResponse = await fetchWithRetry(
        `https://api.github.com/repos/${owner}/${repo}/git/commits/${baseCommitSha}`,
        { headers: githubHeaders(token) },
        `GitHub commit ${baseCommitSha}`,
      );
      if (commitResponse.ok) baseTreeSha = (await commitResponse.json())?.tree?.sha;
    }
  } else if (refResponse.status === 404 || refResponse.status === 409) {
    // Empty/uninitialized repo (e.g. a freshly created dedicated repo with
    // auto_init:false). The Git Data blob API rejects blobs with 409
    // "Git Repository is empty" until an initial commit exists, so the tree
    // flow can't bootstrap it. The Contents API CAN create the first commit —
    // delegate the whole publish there. (The shared generated-sites repo is
    // non-empty, so it still gets the atomic single-commit tree path above.)
    return publishDirectoryToGithubContentsApi({ directory, targetRoot, owner, repo, branch, token, rootDispatcher, message });
  } else {
    throw new Error(`GitHub ref lookup failed ${refResponse.status}: ${await refResponse.text().catch(() => '')}`);
  }

  // 2. Build the tree entries: site files under targetRoot (+ optional dispatcher at root).
  const treeEntries = [];
  const published = [];
  for (const filePath of files) {
    const rel = normalizeSlash(path.relative(directory, filePath));
    const targetPath = normalizeSlash(path.posix.join(targetRoot || '', rel));
    const sha = await createBlob(owner, repo, token, await fs.readFile(filePath));
    treeEntries.push({ path: targetPath, mode: gitFileMode(rel), type: 'blob', sha });
    published.push(targetPath);
  }

  // Include the root dispatcher in the SAME commit when provided.
  if (rootDispatcher) {
    try {
      const os = await import('node:os');
      const fsp = await import('node:fs/promises');
      const tmpDir = await fsp.mkdtemp(path.join(os.default.tmpdir(), 'glondia-root-'));
      const dispatcherPath = await rootDispatcher(tmpDir);
      const content = await fs.readFile(dispatcherPath);
      const sha = await createBlob(owner, repo, token, content);
      treeEntries.push({ path: 'glondia-render-build.sh', mode: '100755', type: 'blob', sha });
      await fsp.rm(tmpDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`[github-publish] Root dispatcher blob skipped: ${error.message}`);
    }
  }

  // 3. Create the tree.
  const treeBody = { tree: treeEntries, ...(baseTreeSha ? { base_tree: baseTreeSha } : {}) };
  const treeResponse = await fetchWithRetry(
    `https://api.github.com/repos/${owner}/${repo}/git/trees`,
    { method: 'POST', headers: { ...githubHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify(treeBody) },
    'GitHub create tree',
  );
  if (!treeResponse.ok) throw new Error(`GitHub tree creation failed ${treeResponse.status}: ${await treeResponse.text().catch(() => '')}`);
  const newTreeSha = (await treeResponse.json()).sha;

  // 4. Create the commit.
  const commitBody = {
    message: message || `Glondiasites: publish ${published.length} files${targetRoot ? ` to ${targetRoot}` : ''}`,
    tree: newTreeSha,
    parents: baseCommitSha ? [baseCommitSha] : [],
  };
  const commitResponse = await fetchWithRetry(
    `https://api.github.com/repos/${owner}/${repo}/git/commits`,
    { method: 'POST', headers: { ...githubHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify(commitBody) },
    'GitHub create commit',
  );
  if (!commitResponse.ok) throw new Error(`GitHub commit creation failed ${commitResponse.status}: ${await commitResponse.text().catch(() => '')}`);
  const commitId = (await commitResponse.json()).sha;

  // 5. Point the branch ref at the new commit (create the ref if the repo was empty).
  if (baseCommitSha) {
    const patch = await fetchWithRetry(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
      { method: 'PATCH', headers: { ...githubHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ sha: commitId, force: false }) },
      'GitHub update ref',
    );
    if (!patch.ok) throw new Error(`GitHub ref update failed ${patch.status}: ${await patch.text().catch(() => '')}`);
  } else {
    const create = await fetchWithRetry(
      `https://api.github.com/repos/${owner}/${repo}/git/refs`,
      { method: 'POST', headers: { ...githubHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commitId }) },
      'GitHub create ref',
    );
    if (!create.ok) throw new Error(`GitHub ref creation failed ${create.status}: ${await create.text().catch(() => '')}`);
  }

  return { repo: `${owner}/${repo}`, branch, targetRoot, published, errors: [], commitId, mode: 'tree' };
}

/**
 * Legacy per-file publish via the Contents API. Kept as a fallback for
 * GITHUB_PUBLISH_MODE=contents and when tree publishing is unavailable.
 */
export async function publishDirectoryToGithubContentsApi({ directory, targetRoot, owner, repo, branch = 'main', token, rootDispatcher, message }) {
  if (rootDispatcher) {
    try {
      const os = await import('node:os');
      const fsp = await import('node:fs/promises');
      const tmpDir = await fsp.mkdtemp(path.join(os.default.tmpdir(), 'glondia-root-'));
      const dispatcherPath = await rootDispatcher(tmpDir);
      const content = await fs.readFile(dispatcherPath);
      await upsertGithubFile({
        owner,
        repo,
        path: 'glondia-render-build.sh',
        branch,
        token,
        content,
        message: 'Glondiasites: update root build dispatcher',
      });
      await fsp.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Dispatcher upload is a fallback safety net; per-site source upload is the required path.
    }
  }

  const files = await walkFiles(directory);
  if (!files.length) throw stageError('No files found to publish to GitHub.', 'github_push', 400);

  const published = [];
  const errors = [];
  let commitId = null;
  for (const filePath of files) {
    const rel = normalizeSlash(path.relative(directory, filePath));
    const targetPath = normalizeSlash(path.posix.join(targetRoot || '', rel));
    try {
      const response = await upsertGithubFile({
        owner,
        repo,
        path: targetPath,
        branch,
        token,
        content: await fs.readFile(filePath),
        message: message || `Publish Glondiasites uploaded site source: ${targetRoot}`,
      });
      // Capture the latest commit SHA so callers can pin a Render deploy to it.
      if (response?.commit?.sha) commitId = response.commit.sha;
      published.push(targetPath);
    } catch (error) {
      errors.push({ path: targetPath, message: error.message });
    }
  }

  if (errors.length) {
    const err = new Error(`GitHub publish completed with ${errors.length} error(s). First: ${errors[0]?.path} - ${errors[0]?.message}`);
    err.status = 502;
    err.stage = 'github_push';
    err.details = { repo: `${owner}/${repo}`, branch, targetRoot, fileCount: files.length, publishedCount: published.length, failedStep: 'contents_put', errors: errors.slice(0, 20) };
    throw err;
  }

  return { repo: `${owner}/${repo}`, branch, targetRoot, published, errors, commitId, mode: 'contents' };
}

async function createBlob(owner, repo, token, content) {
  const response = await fetchWithRetry(
    `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
    { method: 'POST', headers: { ...githubHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content.toString('base64'), encoding: 'base64' }) },
    'GitHub create blob',
  );
  if (!response.ok) throw new Error(`GitHub blob creation failed ${response.status}: ${await response.text().catch(() => '')}`);
  return (await response.json()).sha;
}

// Preserve the executable bit for the generated build scripts; everything else
// is a regular file.
function gitFileMode(relativePath) {
  return /(^|\/)glondia-render-build\.sh$/i.test(relativePath) ? '100755' : '100644';
}

export async function runStage(context) {
  const cfg = context.config || {};
  const publish = await publishDirectoryToGithub({
    directory: context.source.localDir,
    targetRoot: context.github.targetRoot || context.source.rootDir,
    repoUrl: context.github.targetRepo || context.source.repoUrl,
    branch: context.source.branch || 'main',
    token: cfg.githubPublisherToken,
    rootDispatcher: context.github.rootDispatcher,
  });
  context.github = {
    ...context.github,
    targetRepo: publish.repo,
    targetRoot: publish.targetRoot,
    publishedCount: publish.published.length,
    errors: publish.errors,
    publish,
  };
  return context;
}

async function upsertGithubFile({ owner, repo, path: targetPath, branch, token, content, message }) {
  const contentUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponentPath(targetPath)}`;
  let sha = null;
  const existing = await fetchWithRetry(`${contentUrl}?ref=${encodeURIComponent(branch)}`, { headers: githubHeaders(token) }, `GitHub lookup ${targetPath}`);
  if (existing.ok) {
    sha = (await existing.json()).sha;
  } else if (existing.status !== 404) {
    throw new Error(`GitHub lookup failed ${existing.status}: ${await existing.text().catch(() => '')}`);
  }

  const put = await fetchWithRetry(contentUrl, {
    method: 'PUT',
    headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: content.toString('base64'), branch, ...(sha ? { sha } : {}) }),
  }, `GitHub publish ${targetPath}`);
  if (!put.ok) throw new Error(`GitHub publish failed ${put.status}: ${await put.text().catch(() => '')}`);
  return put.json();
}

async function fetchWithRetry(url, options, label, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await delay(250 * attempt);
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastError?.message || 'network error'}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function githubHeaders(token) {
  // Defensive: strip any stray quotes/whitespace so a mis-pasted env value
  // never produces a 401 "Bad credentials".
  return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${cleanGithubToken(token)}`, 'User-Agent': 'glondiasites-render-deploy-lab' };
}

function encodeURIComponentPath(pathValue) {
  return pathValue.split('/').map(encodeURIComponent).join('/');
}

async function walkFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function normalizeSlash(value) {
  return String(value).replace(/\\/g, '/');
}

function isRsaPrivateKey(value) {
  return String(value || '').includes('-----BEGIN RSA PRIVATE KEY-----') || String(value || '').includes('-----BEGIN PRIVATE KEY-----');
}

function stageError(message, stage, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.stage = stage;
  error.expose = true;
  return error;
}
