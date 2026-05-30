import path from 'node:path';
import fs from 'node:fs/promises';
import { hasRealValue } from './runtimeConfig.js';

export function parseGithubRepoUrl(url) {
  const match = String(url || '').match(/github\.com[:/]([^/]+)\/([^/.#?]+)(?:\.git)?/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/i, '') };
}

export async function publishDirectoryToGithub({ directory, targetRoot, repoUrl, branch = 'main', token }) {
  const parsed = parseGithubRepoUrl(repoUrl);
  if (!parsed) throw stageError('Invalid generated-sites GitHub repository URL.', 'github_repo_validate', 400);
  if (!hasRealValue(token)) throw stageError('GITHUB_GENERATED_SITES_TOKEN or GITHUB_TOKEN is required to publish ZIP source files.', 'github_push', 409);

  const files = await walkFiles(directory);
  if (!files.length) throw stageError('No files found to publish to GitHub.', 'github_push', 400);

  const published = [];
  const errors = [];
  for (const filePath of files) {
    const rel = normalizeSlash(path.relative(directory, filePath));
    const targetPath = normalizeSlash(path.posix.join(targetRoot, rel));
    try {
      await upsertGithubFile({ owner: parsed.owner, repo: parsed.repo, path: targetPath, branch, token, content: await fs.readFile(filePath), message: `Publish Glondiasites uploaded site source: ${targetRoot}` });
      published.push(targetPath);
    } catch (error) {
      errors.push({ path: targetPath, message: error.message });
    }
  }

  if (errors.length) {
    const err = new Error(`GitHub publish completed with ${errors.length} error(s). First: ${errors[0]?.path} — ${errors[0]?.message}`);
    err.status = 502;
    err.stage = 'github_push';
    err.details = { repo: `${parsed.owner}/${parsed.repo}`, branch, targetRoot, publishedCount: published.length, errors: errors.slice(0, 20) };
    throw err;
  }

  return { repo: `${parsed.owner}/${parsed.repo}`, branch, targetRoot, published, errors };
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
  return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'glondiasites-render-deploy' };
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

function normalizeSlash(value) { return String(value).replace(/\\/g, '/'); }

function stageError(message, stage, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.stage = stage;
  error.expose = true;
  throw error;
}
