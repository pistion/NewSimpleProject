/**
 * templateCopy.service.js
 * Template copy pipeline + token replacement for Step 02.
 */

import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { badRequest } from '../glondia-engines/00-SHARED/stageErrors.js';
import { getTemplate, getTemplateFiles, readTemplateFile } from './templateLibrary.service.js';

// ─── Path helpers ─────────────────────────────────────────────────────────────

export const DEFAULT_GENERATED_TEMPLATE_SITES_ROOT = 'generated-template-sites';

export function resolveGeneratedTemplateSitesRoot() {
  return cleanPath(
    process.env.RENDER_GENERATED_TEMPLATE_SITES_ROOT_DIR ||
    process.env.GENERATED_TEMPLATE_SITES_ROOT_DIR ||
    DEFAULT_GENERATED_TEMPLATE_SITES_ROOT,
  );
}

export function buildGeneratedTemplateTargetRoot(input = {}) {
  const data = typeof input === 'string' ? { slug: input } : (input || {});
  const owner = safeSegment(data.userId || data.ownerUserId || data.accountId || 'anonymous');
  const site = safeSegment(data.siteId || data.deploymentId || data.templateDeployId || 'site');
  const slug = slugify(data.slug || data.siteName || 'template-site');
  return [resolveGeneratedTemplateSitesRoot(), owner, `${site}-${slug}`].filter(Boolean).join('/');
}

export function buildTemplateCopyData({ answers = {}, site = {}, template = {}, slug = '', targetRoot = '', sourceReference = '' } = {}) {
  const finalSlug = slugify(slug || site.slug || answers.slug || site.siteId);
  const templateId = template.templateId || site.templateId || answers.templateId || answers.parentTemplateId || '';
  const siteName = answers.siteName || answers.businessName || site.siteName || template.name || finalSlug;

  return {
    schema: 'glondia.generated-template-site.v1',
    source: 'template',
    sourceReference: sourceReference || (templateId ? `templates/${templateId}` : ''),
    template: {
      templateId,
      name: template.name || '',
      category: template.category || '',
      framework: template.framework || 'vite',
      templatePath: template.templatePath || (templateId ? `templates/${templateId}` : ''),
      buildCommand: template.buildCommand || 'npm run build',
      publishDirectory: template.publishDirectory || 'dist',
    },
    generated: {
      siteId: site.siteId || '',
      userId: site.userId || site.ownerUserId || answers.userId || '',
      siteName,
      slug: finalSlug,
      githubTargetRoot: targetRoot || buildGeneratedTemplateTargetRoot({ userId: site.userId || site.ownerUserId || answers.userId, siteId: site.siteId, slug: finalSlug }),
      createdAt: new Date().toISOString(),
    },
    userInput: {
      answers,
      brief: answers.brief || {
        businessName: answers.businessName || siteName,
        industry: answers.industry || '',
        targetAudience: answers.targetAudience || answers.audience || '',
        offer: answers.offer || '',
        brandTone: answers.brandTone || answers.tone || '',
        colors: answers.colors || '',
        stylePreferences: answers.stylePreferences || '',
        contact: answers.contact || '',
        domainPreference: answers.domainPreference || answers.domain || '',
        notes: answers.notes || '',
      },
      sitemap: answers.sitemap || null,
      wireframe: answers.wireframe || null,
      style: answers.style || null,
    },
  };
}

export function generatedSiteDir(siteId) {
  const rootDir = resolve(process.cwd());
  const dataDir = resolve(process.env.DATA_DIR || join(rootDir, '.glondia-data'));
  return join(dataDir, 'generated-sites', siteId);
}

// ─── Clone + apply ────────────────────────────────────────────────────────────

export async function cloneTemplate(site, options = {}) {
  if (!site?.siteId) throw badRequest('siteId is required.', 'template_source', 'TEMPLATE_SITE_REQUIRED');
  const templateId = site.templateId || options.templateId;
  if (!templateId) throw badRequest('templateId is required.', 'template_source', 'TEMPLATE_ID_REQUIRED');

  const metadata = await getTemplate(templateId);
  const slug = slugify(options.slug || site.slug || site.siteName || site.answers?.businessName || site.siteId);
  const ownerUserId = options.userId || site.userId || site.ownerUserId || site.answers?.userId || 'anonymous';
  const githubTargetRoot = buildGeneratedTemplateTargetRoot({ userId: ownerUserId, siteId: site.siteId, slug });
  const siteDir = generatedSiteDir(site.siteId);
  await resetDirectory(siteDir);

  const files = await getTemplateFiles(templateId);
  if (!files.length) throw badRequest(`Template "${templateId}" contains no files.`, 'template_source', 'TEMPLATE_EMPTY');

  const copied = [];
  for (const file of files) {
    if (file.relativePath === 'template.json') continue;
    if (!isSafeRelativePath(file.relativePath)) {
      throw badRequest(`Template file path "${file.relativePath}" is unsafe.`, 'template_source', 'TEMPLATE_FILE_PATH_UNSAFE');
    }
    const targetPath = join(siteDir, file.relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    const downloaded = await readTemplateFile(file.path);
    await writeFile(targetPath, downloaded.content);
    copied.push(file.relativePath);
  }

  return { siteDir, copied, metadata, slug, ownerUserId, githubTargetRoot };
}

export async function applyClientData(siteDir, answers = {}, metadata = {}) {
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
  return siteData;
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

// ─── Internals ────────────────────────────────────────────────────────────────

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

function cleanPath(value = '') {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
}

function safeSegment(value = '') {
  return slugify(value).slice(0, 90) || 'unknown';
}

function slugify(value) {
  return String(value || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
}
