/**
 * githubPublisher.stage.js - 03-GITHUB-SOURCE-MOUNTAIN
 *
 * Publishes extracted source folders into the generated-sites GitHub repo.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { hasRealValue } from '../../00-SHARED/runtimeConfig.js';
import { getGithubInstallationToken } from './githubAppAuth.stage.js';

export function parseGithubRepoUrl(url) {
  const match = String(url || '').match(/github\.com[:/]([^/]+)\/([^/.#?]+)(?:\.git)?/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/i, '') };
}

export async function publishDirectoryToGithub({ directory, targetRoot, repoUrl, branch = 'main', token, rootDispatcher }) {
  const parsed = parseGithubRepoUrl(repoUrl);
  if (!parsed) throw stageError('Invalid generated-sites GitHub repository URL.', 'github_repo_validate', 400);
  if (!hasRealValue(token)) throw stageError('GITHUB_GENERATED_SITES_TOKEN or GITHUB_TOKEN is required to publish ZIP source files.', 'github_push', 409);

  if (isRsaPrivateKey(token)) {
    const appId = process.env.GITHUB_APP_ID;
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!appId && !clientId) throw stageError('GITHUB_APP_ID is required when GITHUB_GENERATED_SITES_TOKEN or GITHUB_TOKEN is a GitHub App private key.', 'github_push', 409);
    token = await getGithubInstallationToken({ appId, clientId, privateKey: token, owner: parsed.owner, repo: parsed.repo });
  }

  if (rootDispatcher) {
    try {
      const os = await import('node:os');
      const fsp = await import('node:fs/promises');
      const tmpDir = await fsp.mkdtemp(path.join(os.default.tmpdir(), 'glondia-root-'));
      const dispatcherPath = await rootDispatcher(tmpDir);
      const content = await fs.readFile(dispatcherPath);
      await upsertGithubFile({
        owner: parsed.owner,
        repo: parsed.repo,
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
    const targetPath = normalizeSlash(path.posix.join(targetRoot, rel));
    try {
      const response = await upsertGithubFile({
        owner: parsed.owner,
        repo: parsed.repo,
        path: targetPath,
        branch,
        token,
        content: await fs.readFile(filePath),
        message: `Publish Glondiasites uploaded site source: ${targetRoot}`,
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
    err.details = { repo: `${parsed.owner}/${parsed.repo}`, branch, targetRoot, publishedCount: published.length, errors: errors.slice(0, 20) };
    throw err;
  }

  return { repo: `${parsed.owner}/${parsed.repo}`, branch, targetRoot, published, errors, commitId };
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
  const existing = await fetch(`${contentUrl}?ref=${encodeURIComponent(branch)}`, { headers: githubHeaders(token) });
  if (existing.ok) {
    sha = (await existing.json()).sha;
  } else if (existing.status !== 404) {
    throw new Error(`GitHub lookup failed ${existing.status}: ${await existing.text().catch(() => '')}`);
  }

  const put = await fetch(contentUrl, {
    method: 'PUT',
    headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: content.toString('base64'), branch, ...(sha ? { sha } : {}) }),
  });
  if (!put.ok) throw new Error(`GitHub publish failed ${put.status}: ${await put.text().catch(() => '')}`);
  return put.json();
}

function githubHeaders(token) {
  return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'glondiasites-render-deploy-lab' };
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
