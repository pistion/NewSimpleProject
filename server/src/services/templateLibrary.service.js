/**
 * templateLibrary.service.js
 * All template catalog + GitHub read logic for Step 01.
 */

import { badRequest } from '../glondia-engines/00-SHARED/stageErrors.js';
import { cleanGithubToken } from '../glondia-engines/00-SHARED/runtimeConfig.js';
import { parseGitHubRepoUrl } from '../glondia-engines/01-HOSTING-DEPLOY-ENGINE/03-GITHUB-SOURCE-MOUNTAIN/generatedSitesRepoPublisher.stage.js';

const DEFAULT_TEMPLATE_REPO = 'https://github.com/pistion/glondia-generated-sites.git';
const DEFAULT_TEMPLATE_ROOT = 'templates';
const DEFAULT_BRANCH = 'main';

export function getTemplateLibraryConfig() {
  return {
    repoUrl: process.env.TEMPLATE_LIBRARY_REPO_URL || process.env.RENDER_GENERATED_SITES_REPO_URL || DEFAULT_TEMPLATE_REPO,
    root: cleanRepoPath(process.env.TEMPLATE_LIBRARY_ROOT || DEFAULT_TEMPLATE_ROOT),
    branch: process.env.TEMPLATE_LIBRARY_BRANCH || process.env.RENDER_GENERATED_SITES_BRANCH || DEFAULT_BRANCH,
  };
}

export function normalizeTemplateId(value) {
  const id = String(value || '').trim();
  if (!id) return '';
  if (id.length > 100) throw badRequest('templateId is too long.', 'template_library', 'TEMPLATE_ID_TOO_LONG');
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) {
    throw badRequest('templateId contains unsupported characters.', 'template_library', 'TEMPLATE_ID_INVALID');
  }
  return id;
}

export function templatePathForId(templateId) {
  const id = normalizeTemplateId(templateId);
  return cleanRepoPath([getTemplateLibraryConfig().root, id].filter(Boolean).join('/'));
}

export async function listTemplates() {
  const config = getTemplateLibraryConfig();
  const rows = await getGithubContents(config.root, config);
  const dirs = Array.isArray(rows) ? rows.filter((entry) => entry?.type === 'dir') : [];
  const templates = [];

  for (const dir of dirs) {
    const templateId = normalizeTemplateId(dir.name);
    const metadata = await readTemplateMetadata(templateId).catch(() => defaultTemplateMetadata(templateId, dir.path));
    templates.push(lightweightTemplateMetadata(metadata));
  }

  return {
    repoUrl: config.repoUrl,
    root: config.root,
    branch: config.branch,
    templates,
  };
}

export async function getTemplate(templateId) {
  const id = normalizeTemplateId(templateId);
  const metadata = await readTemplateMetadata(id);
  return lightweightTemplateMetadata(metadata);
}

export async function readTemplateMetadata(templateId) {
  const id = normalizeTemplateId(templateId);
  const templatePath = templatePathForId(id);
  const config = getTemplateLibraryConfig();
  const file = await getGithubFile(`${templatePath}/template.json`, config);
  const metadata = JSON.parse(file.content.toString('utf8'));
  return {
    ...defaultTemplateMetadata(id, templatePath),
    ...metadata,
    templateId: metadata.templateId || id,
    templatePath,
  };
}

export async function getTemplateFiles(templateId) {
  const id = normalizeTemplateId(templateId);
  const templatePath = templatePathForId(id);
  const config = getTemplateLibraryConfig();
  const entries = await listGithubTree(templatePath, config);
  return entries
    .filter((entry) => entry.type === 'file')
    .map((entry) => ({
      ...entry,
      relativePath: entry.path.slice(templatePath.length).replace(/^\/+/, ''),
    }));
}

export async function readTemplateFile(repoPath) {
  return getGithubFile(repoPath, getTemplateLibraryConfig());
}

function defaultTemplateMetadata(templateId, templatePath) {
  return {
    templateId,
    name: titleCase(templateId),
    category: 'General',
    framework: 'vite',
    buildCommand: 'npm run build',
    publishDirectory: 'dist',
    previewImage: '',
    questionnaireProfile: 'general',
    templatePath,
  };
}

function lightweightTemplateMetadata(metadata = {}) {
  return {
    templateId: metadata.templateId,
    name: metadata.name || titleCase(metadata.templateId),
    category: metadata.category || 'General',
    description: metadata.description || '',
    framework: metadata.framework || 'vite',
    buildCommand: metadata.buildCommand || 'npm run build',
    publishDirectory: metadata.publishDirectory || 'dist',
    previewImage: metadata.previewImage || '',
    previewUrl: metadata.previewUrl || '',
    questionnaireProfile: metadata.questionnaireProfile || 'general',
    templatePath: metadata.templatePath || templatePathForId(metadata.templateId),
    supportedPages: Array.isArray(metadata.supportedPages) ? metadata.supportedPages : [],
    supportedSections: Array.isArray(metadata.supportedSections) ? metadata.supportedSections : [],
    sectionSlotHints: (metadata.sectionSlotHints && typeof metadata.sectionSlotHints === 'object') ? metadata.sectionSlotHints : {},
    placeholderHints: (metadata.placeholderHints && typeof metadata.placeholderHints === 'object') ? metadata.placeholderHints : {},
  };
}

async function listGithubTree(path, config) {
  const rows = await getGithubContents(path, config);
  const files = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row.type === 'dir') files.push(...await listGithubTree(row.path, config));
    if (row.type === 'file') files.push({ path: row.path, sha: row.sha, size: row.size, type: row.type });
  }
  return files;
}

async function getGithubFile(path, config) {
  const body = await getGithubContents(path, config);
  if (Array.isArray(body) || body.type !== 'file') {
    throw badRequest(`Template file "${path}" was not found.`, 'template_library', 'TEMPLATE_FILE_NOT_FOUND');
  }
  const encoded = String(body.content || '').replace(/\s+/g, '');
  return {
    path: body.path,
    sha: body.sha,
    content: Buffer.from(encoded, body.encoding === 'base64' ? 'base64' : 'utf8'),
  };
}

async function getGithubContents(path, config) {
  const parsed = parseGitHubRepoUrl(config.repoUrl);
  if (!parsed) throw badRequest('TEMPLATE_LIBRARY_REPO_URL must be a GitHub repository URL.', 'template_library', 'TEMPLATE_REPO_INVALID');
  const url = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/contents/${encodeRepoPath(cleanRepoPath(path))}?ref=${encodeURIComponent(config.branch)}`;
  const response = await fetch(url, { headers: githubHeaders() });
  if (response.status === 404) throw badRequest(`Template library path "${path}" was not found.`, 'template_library', 'TEMPLATE_PATH_NOT_FOUND');
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body?.message || `GitHub returned ${response.status} while reading template library.`);
    error.status = response.status;
    error.code = 'TEMPLATE_LIBRARY_GITHUB_ERROR';
    error.expose = true;
    throw error;
  }
  return response.json();
}

function githubHeaders() {
  const token = cleanGithubToken(process.env.GITHUB_GENERATED_SITES_TOKEN || process.env.GENERATED_SITES_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '');
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'glondia-template-library',
    ...(token && !token.startsWith('-----BEGIN') ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function cleanRepoPath(value = '') {
  const path = String(value || '').replace(/\\/g, '/').split('/').filter(Boolean);
  if (path.some((part) => part === '..' || part.includes('\0'))) {
    throw badRequest('Template path is unsafe.', 'template_library', 'TEMPLATE_PATH_UNSAFE');
  }
  return path.join('/');
}

function encodeRepoPath(path) {
  return String(path || '').split('/').map(encodeURIComponent).join('/');
}

function titleCase(value) {
  return String(value || 'Template').replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
