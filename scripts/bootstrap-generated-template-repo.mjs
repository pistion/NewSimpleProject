#!/usr/bin/env node
/**
 * Bootstrap the shared generated-sites repository with heavy template storage.
 *
 * Usage:
 *   GITHUB_GENERATED_SITES_TOKEN=... node scripts/bootstrap-generated-template-repo.mjs
 *   node scripts/bootstrap-generated-template-repo.mjs --dry-run
 *
 * Defaults:
 *   repo: https://github.com/pistion/glondia-generated-sites.git
 *   source: ./templates
 *   target: templates/
 *   generated template target marker: generated-template-sites/.gitkeep
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const repoUrl = valueAfter('--repo') || process.env.TEMPLATE_LIBRARY_REPO_URL || process.env.RENDER_GENERATED_SITES_REPO_URL || 'https://github.com/pistion/glondia-generated-sites.git';
const branch = valueAfter('--branch') || process.env.TEMPLATE_LIBRARY_BRANCH || 'main';
const sourceDir = resolve(valueAfter('--source') || 'templates');
const templateRoot = cleanPath(valueAfter('--template-root') || process.env.TEMPLATE_LIBRARY_ROOT || 'templates');
const generatedTemplateRoot = cleanPath(valueAfter('--generated-template-root') || process.env.RENDER_GENERATED_TEMPLATE_SITES_ROOT_DIR || process.env.GENERATED_TEMPLATE_SITES_ROOT_DIR || 'generated-template-sites');

const token = cleanToken(
  process.env.GITHUB_GENERATED_SITES_TOKEN ||
  process.env.GENERATED_SITES_GITHUB_TOKEN ||
  process.env.GITHUB_TOKEN ||
  '',
);

const parsed = parseGitHubRepoUrl(repoUrl);
if (!parsed) fail(`Invalid GitHub repo URL: ${repoUrl}`);
if (!existsSync(sourceDir)) fail(`Template source directory not found: ${sourceDir}`);
if (!dryRun && !token) fail('Missing GITHUB_GENERATED_SITES_TOKEN, GENERATED_SITES_GITHUB_TOKEN, or GITHUB_TOKEN.');

const templates = await listTemplateDirectories(sourceDir);
if (!templates.length) fail(`No template folders with template.json found in ${sourceDir}`);

const files = await listFiles(sourceDir);
const uploadRows = files
  .filter((filePath) => !shouldSkip(filePath))
  .map((filePath) => {
    const rel = relative(sourceDir, filePath).replace(/\\/g, '/');
    return { filePath, repoPath: cleanPath(`${templateRoot}/${rel}`) };
  });

console.log(`Repo: ${parsed.owner}/${parsed.repo}`);
console.log(`Branch: ${branch}`);
console.log(`Template source: ${sourceDir}`);
console.log(`Template target: ${templateRoot}/`);
console.log(`Generated template marker: ${generatedTemplateRoot}/.gitkeep`);
console.log(`Templates: ${templates.map((template) => template.templateId).join(', ')}`);
console.log(`Files to upload: ${uploadRows.length}`);

if (dryRun) {
  for (const row of uploadRows.slice(0, 20)) console.log(`DRY ${row.repoPath}`);
  if (uploadRows.length > 20) console.log(`DRY ... ${uploadRows.length - 20} more`);
  console.log('Dry run complete. No GitHub writes performed.');
  process.exit(0);
}

await assertRepoAccess(parsed);

let uploaded = 0;
for (const row of uploadRows) {
  const content = await readFile(row.filePath);
  await putFile(parsed, row.repoPath, content, `Bootstrap template library: ${row.repoPath}`);
  uploaded += 1;
  if (uploaded % 10 === 0) console.log(`Uploaded ${uploaded}/${uploadRows.length}`);
}

await putFile(parsed, `${generatedTemplateRoot}/.gitkeep`, Buffer.from('Generated template site copies are published here.\n'), `Create ${generatedTemplateRoot} marker`);

console.log(`Done. Uploaded ${uploaded} template files and ensured ${generatedTemplateRoot}/.gitkeep.`);

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function listTemplateDirectories(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const rows = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const templateJsonPath = join(dir, entry.name, 'template.json');
    if (!existsSync(templateJsonPath)) continue;
    const metadata = JSON.parse(await readFile(templateJsonPath, 'utf8'));
    if (!metadata.templateId) fail(`${templateJsonPath} is missing templateId.`);
    rows.push({ dir: entry.name, templateId: metadata.templateId });
  }
  return rows;
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(fullPath));
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function shouldSkip(filePath) {
  const rel = relative(sourceDir, filePath).replace(/\\/g, '/');
  return rel.split('/').some((part) => ['node_modules', '.git', 'dist', '.DS_Store'].includes(part));
}

async function assertRepoAccess(repo) {
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`, {
    headers: githubHeaders(),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) fail(body?.message || `GitHub access failed with ${response.status}.`);
  if (body.permissions && !body.permissions.push) fail(`Token can read ${repo.owner}/${repo.repo}, but cannot push. It needs Contents: Read and write.`);
}

async function putFile(repo, path, content, message) {
  const existingSha = await getExistingSha(repo, path);
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/contents/${encodeRepoPath(path)}`, {
    method: 'PUT',
    headers: githubHeaders(),
    body: JSON.stringify({
      message,
      branch,
      content: Buffer.from(content).toString('base64'),
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) fail(body?.message || `GitHub upload failed for ${path}.`);
}

async function getExistingSha(repo, path) {
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(branch)}`, {
    headers: githubHeaders(),
  });
  if (response.status === 404) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) fail(body?.message || `GitHub lookup failed for ${path}.`);
  return body.sha || null;
}

function githubHeaders() {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'GlondiaSites-TemplateRepoBootstrap',
  };
}

function parseGitHubRepoUrl(value = '') {
  const text = String(value || '').trim();
  const ssh = text.match(/^git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/i);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };
  const https = text.match(/^https?:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?\/?$/i);
  if (https) return { owner: https[1], repo: https[2] };
  const shorthand = text.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shorthand) return { owner: shorthand[1], repo: shorthand[2].replace(/\.git$/i, '') };
  return null;
}

function encodeRepoPath(path) {
  return String(path || '').split('/').map(encodeURIComponent).join('/');
}

function cleanPath(value = '') {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
}

function cleanToken(value = '') {
  return String(value || '').trim().replace(/^Bearer\s+/i, '').replace(/^token\s+/i, '').replace(/^["']|["']$/g, '');
}
