/**
 * generatedTemplateSiteScanner.stage.js
 *
 * Creates inspectable deployment metadata for a generated template copy before
 * GitHub publish / Hosting handoff.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

export async function scanGeneratedTemplateSite(siteDir, options = {}) {
  if (!siteDir || !existsSync(siteDir)) {
    return { scanned: false, error: 'Generated template site directory was not found.' };
  }

  const files = await listFiles(siteDir);
  const relativeFiles = files.map((filePath) => relative(siteDir, filePath).replace(/\\/g, '/')).sort();
  const packageJson = await readJsonIfExists(join(siteDir, 'package.json'));
  const routeManifest = await readJsonIfExists(join(siteDir, 'public', 'route-manifest.json'));
  const siteData = await readJsonIfExists(join(siteDir, 'glondia-template-copy.json'))
    || await readJsonIfExists(join(siteDir, 'glondia-site-data.json'));

  const framework = options.framework || detectFramework(packageJson, relativeFiles);
  const buildCommand = options.buildCommand || packageJson?.scripts?.build || 'npm run build';
  const publishDirectory = options.publishDirectory || options.outputDirectory || 'dist';
  const rootDirectory = options.rootDirectory || siteData?.generated?.githubTargetRoot || '';

  const scan = {
    schema: 'glondia.generated-template-site-scan.v1',
    scannedAt: new Date().toISOString(),
    site: {
      siteId: options.siteId || siteData?.generated?.siteId || '',
      siteName: options.siteName || siteData?.generated?.siteName || '',
      slug: options.slug || siteData?.generated?.slug || '',
    },
    template: siteData?.template || {
      templateId: options.templateId || '',
      framework,
    },
    source: {
      directory: siteDir,
      fileCount: relativeFiles.length,
      files: relativeFiles,
      hasPackageJson: Boolean(packageJson),
      hasIndexHtml: relativeFiles.includes('index.html'),
      routes: Array.isArray(routeManifest?.routes) ? routeManifest.routes : inferRoutes(routeManifest, siteData),
      textFileCount: relativeFiles.filter(isTextFile).length,
    },
    build: {
      framework,
      packageManager: options.packageManager || detectPackageManager(relativeFiles),
      buildCommand,
      publishDirectory,
    },
    handoff: {
      repositoryUrl: options.repoUrl || options.repositoryUrl || '',
      branch: options.branch || 'main',
      rootDirectory,
      deploymentProvider: options.deploymentProvider || 'render',
    },
  };

  const payloadPreview = {
    schema: 'glondia.hosting-payload-preview.v1',
    provider: scan.handoff.deploymentProvider,
    serviceType: options.serviceType || 'static_site',
    repoUrl: scan.handoff.repositoryUrl,
    branch: scan.handoff.branch,
    rootDirectory: scan.handoff.rootDirectory,
    buildCommand: scan.build.buildCommand,
    publishDirectory: scan.build.publishDirectory,
    framework: scan.build.framework,
    generatedAt: new Date().toISOString(),
  };

  await writeFile(join(siteDir, 'glondia-site-scan.json'), JSON.stringify(scan, null, 2), 'utf8');
  await writeFile(join(siteDir, 'glondia-hosting-payload.json'), JSON.stringify(payloadPreview, null, 2), 'utf8');

  return {
    ...scan,
    payloadPreview,
    manifestFiles: ['glondia-site-scan.json', 'glondia-hosting-payload.json'],
  };
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

async function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function detectFramework(packageJson, files = []) {
  const deps = { ...(packageJson?.dependencies || {}), ...(packageJson?.devDependencies || {}) };
  if (deps.vite && (deps.react || deps['@vitejs/plugin-react'])) return 'vite-react';
  if (deps.vite) return 'vite';
  if (files.includes('vite.config.js') || files.includes('vite.config.ts')) return 'vite';
  if (files.includes('package.json')) return 'node-static';
  return 'static';
}

function detectPackageManager(files = []) {
  if (files.includes('pnpm-lock.yaml')) return 'pnpm';
  if (files.includes('yarn.lock')) return 'yarn';
  if (files.includes('package-lock.json')) return 'npm';
  if (files.includes('package.json')) return 'npm';
  return 'none';
}

function inferRoutes(routeManifest, siteData) {
  if (Array.isArray(routeManifest)) return routeManifest;
  const pages = siteData?.userInput?.sitemap?.pages;
  if (Array.isArray(pages)) return pages.map((page) => page.path || '/').filter(Boolean);
  return ['/'];
}

function isTextFile(filePath) {
  return ['.html', '.htm', '.css', '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.txt', '.svg', '.yml', '.yaml'].includes(extname(filePath).toLowerCase());
}
