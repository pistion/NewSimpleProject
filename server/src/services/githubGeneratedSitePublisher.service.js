import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DEFAULT_BRANCH = 'main';

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
  return Boolean(parseGitHubRepoUrl(repoUrl) && (process.env.GITHUB_GENERATED_SITES_TOKEN || process.env.GITHUB_TOKEN));
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

  const token = process.env.GITHUB_GENERATED_SITES_TOKEN || process.env.GITHUB_TOKEN || '';
  if (!token) return { attempted: false, skippedReason: 'Missing GITHUB_GENERATED_SITES_TOKEN. Generated files were not pushed to GitHub.' };
  if (!siteDir) return { attempted: false, skippedReason: 'Generated site directory is missing.' };

  const files = await listFiles(siteDir);
  if (files.length === 0) return { attempted: false, skippedReason: 'Generated site directory contains no files to publish.' };

  const published = [];
  const errors = [];
  const safeRoot = cleanPath(targetRoot);

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
    } catch (error) {
      errors.push({ path: repoPath, message: error.message });
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

async function getExistingFileSha({ owner, repo, path, branch, token }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, { headers: githubHeaders(token) });
  if (response.status === 404) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.message || `GitHub lookup failed for ${path}.`);
  return result?.sha || null;
}

async function putFile({ owner, repo, path, branch, token, contentBase64, sha, message }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;
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
