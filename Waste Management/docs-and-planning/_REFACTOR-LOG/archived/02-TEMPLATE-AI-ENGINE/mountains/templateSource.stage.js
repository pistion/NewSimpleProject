/**
 * templateSource.stage.js - 02-TEMPLATE-SOURCE-MOUNTAIN
 *
 * Resolves heavy template source from the configured template library repo,
 * then materializes a customer-specific generated copy for editing/deploy.
 */

import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { badRequest } from '../../00-SHARED/stageErrors.js';
import {
  getTemplateDetails,
  getTemplateRepositoryFiles,
  readTemplateRepositoryFile,
} from '../01-TEMPLATE-LIBRARY-MOUNTAIN/templateSelection.stage.js';
import {
  buildGeneratedTemplateTargetRoot,
  buildTemplateCopyData,
} from './templateGeneratedCopy.stage.js';
import { scanGeneratedTemplateSite } from '../07-HANDOFF-TO-HOSTING-MOUNTAIN/generatedTemplateSiteScanner.stage.js';

export function resolveTemplateSource(input = {}, template = {}) {
  if (template.templateId) {
    return {
      sourceType: 'template-library-repo',
      templateId: template.templateId,
      templateRepoUrl: template.templateRepoUrl,
      templatePath: template.templatePath,
    };
  }

  const html = input.templateHtml || template.html || '';
  if (!html || typeof html !== 'string') {
    throw badRequest('templateHtml (string) is required.', 'template_source', 'TEMPLATE_HTML_REQUIRED');
  }
  if (html.length > 200_000) {
    throw badRequest('templateHtml exceeds 200 kB limit.', 'template_source', 'TEMPLATE_HTML_TOO_LARGE');
  }
  return { html, sourceType: 'frontend-bundled-html' };
}

export async function runStage(context) {
  context.template = { ...context.template, ...resolveTemplateSource(context.input || {}, context.template || {}) };
  return context;
}

export async function prepareTemplateGeneratedSource(site, options = {}) {
  if (!site?.siteId) throw badRequest('siteId is required.', 'template_source', 'TEMPLATE_SITE_REQUIRED');
  const templateId = site.templateId || options.templateId;
  if (!templateId) throw badRequest('templateId is required.', 'template_source', 'TEMPLATE_ID_REQUIRED');

  const metadata = await getTemplateDetails(templateId);
  const slug = slugify(options.slug || site.slug || site.siteName || site.answers?.businessName || site.siteId);
  const ownerUserId = options.userId || site.userId || site.ownerUserId || site.answers?.userId || 'anonymous';
  const githubTargetRoot = buildGeneratedTemplateTargetRoot({ userId: ownerUserId, siteId: site.siteId, slug });
  const siteDir = generatedSiteDir(site.siteId);
  await resetDirectory(siteDir);

  const files = await getTemplateRepositoryFiles(templateId);
  if (!files.length) throw badRequest(`Template "${templateId}" contains no files.`, 'template_source', 'TEMPLATE_EMPTY');

  const copied = [];
  for (const file of files) {
    if (file.relativePath === 'template.json') continue;
    if (!isSafeRelativePath(file.relativePath)) {
      throw badRequest(`Template file path "${file.relativePath}" is unsafe.`, 'template_source', 'TEMPLATE_FILE_PATH_UNSAFE');
    }
    const targetPath = join(siteDir, file.relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    const downloaded = await readTemplateRepositoryFile(file.path);
    await writeFile(targetPath, downloaded.content);
    copied.push(file.relativePath);
  }

  await applyQuestionnaireDataToGeneratedSource(siteDir, {
    ...(site.answers || {}),
    ...(options.answers || {}),
    siteName: options.siteName || site.siteName || site.answers?.businessName || metadata.name,
    businessName: options.siteName || site.answers?.businessName || site.siteName || metadata.name,
    slug,
    templateId,
  }, {
    site,
    template: metadata,
    slug,
    targetRoot: githubTargetRoot,
    sourceReference: `templates/${templateId}`,
  });

  const scan = await scanGeneratedTemplateSite(siteDir, {
    siteId: site.siteId,
    userId: ownerUserId,
    siteName: options.siteName || site.siteName || site.answers?.businessName || metadata.name,
    slug,
    templateId,
    framework: metadata.framework || 'vite',
    packageManager: metadata.packageManager || 'npm',
    buildCommand: options.buildCommand || metadata.buildCommand || 'npm run build',
    publishDirectory: options.publishDirectory || metadata.publishDirectory || 'dist',
    rootDirectory: githubTargetRoot,
    repoUrl: options.repoUrl || options.repositoryUrl || process.env.RENDER_GENERATED_SITES_REPO_URL || process.env.GENERATED_SITES_REPO_URL || 'https://github.com/pistion/glondia-generated-sites.git',
    branch: options.branch || 'main',
  });

  const pages = await readPreviewPages(siteDir);
  return {
    siteDir,
    sourceType: 'template-library-generated-copy',
    framework: metadata.framework || 'vite',
    packageManager: metadata.packageManager || 'npm',
    buildCommand: options.buildCommand || metadata.buildCommand || 'npm run build',
    publishDirectory: options.publishDirectory || metadata.publishDirectory || 'dist',
    templateId,
    templatePath: metadata.templatePath,
    templateMetadata: metadata,
    files: [...copied, ...(scan.manifestFiles || [])],
    pages,
    scan,
    githubTargetRoot,
    siteProfile: {
      ...(site.answers || {}),
      siteId: site.siteId,
      userId: ownerUserId,
      parentTemplateId: templateId,
      siteName: options.siteName || site.siteName || site.answers?.businessName || metadata.name,
      slug,
      githubTargetRoot,
      generatedAt: new Date().toISOString(),
    },
  };
}

export async function applyQuestionnaireDataToGeneratedSource(siteDir, answers = {}, metadata = {}) {
  const files = await listFiles(siteDir);
  const textFiles = files.filter(isTextFile);
  const replacements = buildReplacementMap(answers);

  for (const filePath of textFiles) {
    let text = await readFile(filePath, 'utf8');
    let changed = false;
    for (const [needle, value] of replacements) {
      if (text.includes(needle)) {
        text = text.split(needle).join(value);
        changed = true;
      }
    }
    if (changed) await writeFile(filePath, text, 'utf8');
  }

  const siteData = buildTemplateCopyData({
    answers,
    site: metadata.site || {},
    template: metadata.template || {},
    slug: metadata.slug || answers.slug,
    targetRoot: metadata.targetRoot || buildGeneratedTemplateTargetRoot({
      userId: metadata.site?.userId || metadata.site?.ownerUserId || answers.userId,
      siteId: metadata.site?.siteId,
      slug: answers.slug || answers.siteName || answers.businessName,
    }),
    sourceReference: metadata.sourceReference,
  });
  siteData.updatedAt = new Date().toISOString();

  await writeFile(join(siteDir, 'glondia-site-data.json'), JSON.stringify(siteData, null, 2), 'utf8');
  await writeFile(join(siteDir, 'glondia-template-copy.json'), JSON.stringify(siteData, null, 2), 'utf8');
}

export async function copyPreparedSource(sourceDir, targetDir) {
  if (!existsSync(sourceDir)) throw badRequest('Prepared template source was not found.', 'template_source', 'TEMPLATE_SOURCE_MISSING');
  await resetDirectory(targetDir);
  const files = await listFiles(sourceDir);
  for (const filePath of files) {
    const rel = relative(sourceDir, filePath);
    const target = join(targetDir, rel);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(filePath, target);
  }
}

function generatedSiteDir(siteId) {
  const rootDir = resolve(process.cwd());
  const dataDir = resolve(process.env.DATA_DIR || join(rootDir, '.glondia-data'));
  return join(dataDir, 'generated-sites', siteId);
}

async function readPreviewPages(siteDir) {
  const candidates = ['index.html', 'src/index.html', 'public/index.html'];
  for (const candidate of candidates) {
    const filePath = join(siteDir, candidate);
    if (existsSync(filePath)) {
      const html = await readFile(filePath, 'utf8');
      return [{ title: 'Home', path: '/', html }];
    }
  }
  return [];
}

async function resetDirectory(dir) {
  const rootDir = resolve(process.cwd());
  const dataDir = resolve(process.env.DATA_DIR || join(rootDir, '.glondia-data'));
  const resolved = resolve(dir);
  if (!resolved.startsWith(dataDir)) throw badRequest('Refusing to write generated template outside DATA_DIR.', 'template_source', 'TEMPLATE_OUTPUT_UNSAFE');
  await rm(resolved, { recursive: true, force: true });
  await mkdir(resolved, { recursive: true });
}

async function listFiles(dir) {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(fullPath));
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function buildReplacementMap(answers = {}) {
  const rows = [];
  for (const [key, raw] of Object.entries(answers || {})) {
    if (raw === undefined || raw === null) continue;
    const value = Array.isArray(raw) ? raw.join(', ') : String(raw);
    const upper = key.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
    rows.push([`{{${key}}}`, value], [`{{ ${key} }}`, value], [`[[${key}]]`, value], [`__${upper}__`, value]);
  }
  if (answers.businessName || answers.siteName) {
    const value = String(answers.businessName || answers.siteName);
    rows.push(['[Business Name]', value], ['Your Business Name', value], ['My Business', value]);
  }
  return rows;
}

function isTextFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  return ['.html', '.htm', '.css', '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.txt', '.svg', '.env', '.yml', '.yaml'].includes(ext);
}

function isSafeRelativePath(value = '') {
  const parts = String(value || '').replace(/\\/g, '/').split('/').filter(Boolean);
  return Boolean(parts.length) && !parts.some((part) => part === '..' || part.includes('\0'));
}

function slugify(value) {
  return String(value || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
}
