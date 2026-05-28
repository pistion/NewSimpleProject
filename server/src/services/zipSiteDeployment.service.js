import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import AdmZip from 'adm-zip';
import { makeId, mutateHostingStore, nowIso } from './hostingStore.js';
import renderApiService from './renderApiService.js';
import { publishGeneratedSiteToGitHub } from './githubGeneratedSitePublisher.service.js';

const rootDir = resolve(process.cwd());
const dataDir = resolve(process.env.DATA_DIR || join(rootDir, '.glondia-data'));
const uploadedRoot = join(dataDir, 'uploaded-sites');
const MAX_ZIP_BYTES = Number(process.env.ZIP_UPLOAD_MAX_BYTES || 25 * 1024 * 1024);
const MAX_EXTRACTED_FILES = Number(process.env.ZIP_UPLOAD_MAX_FILES || 800);
const MAX_ENTRY_BYTES = Number(process.env.ZIP_UPLOAD_MAX_ENTRY_BYTES || 8 * 1024 * 1024);

const IGNORED_SOURCE_PATTERNS = [
  'node_modules/',
  '.git/',
  '.next/cache/',
  'dist/',
  'build/',
  '.vercel/',
  '.netlify/',
  'coverage/',
  '.DS_Store',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'npm-debug.log',
  'yarn-error.log',
];

export async function deployZipSite(input = {}) {
  const fileName = sanitizeFileName(input.fileName || 'uploaded-site.zip');
  const base64 = String(input.fileBase64 || '').replace(/^data:.*?;base64,/, '');
  if (!base64) throw badRequest('fileBase64 is required.');

  const zipBuffer = Buffer.from(base64, 'base64');
  if (!zipBuffer.length) throw badRequest('Uploaded ZIP is empty.');
  if (zipBuffer.length > MAX_ZIP_BYTES) throw badRequest(`ZIP is too large. Max size is ${Math.round(MAX_ZIP_BYTES / 1024 / 1024)} MB.`);

  const siteName = String(input.siteName || fileName.replace(/\.zip$/i, '') || 'uploaded-site').trim();
  const finalSlug = slugify(input.slug || siteName);
  const branch = input.branch || 'main';
  const serviceType = input.serviceType || 'static_site';
  const plan = input.plan || 'starter';
  const environment = input.environment || 'production';
  const publishDirectory = input.publishDirectory || 'dist';
  const deploymentId = makeId('dep');
  const uploadId = makeId('zip');
  const siteDir = join(uploadedRoot, uploadId);
  const now = nowIso();

  await rm(siteDir, { recursive: true, force: true });
  await mkdir(siteDir, { recursive: true });

  const extracted = await extractZipSafely(zipBuffer, siteDir);
  const detected = detectProject(extracted.files);
  const buildCommand = buildShellHandoffCommand(input.buildCommand, detected);
  const shellFile = await writeRenderShellFile(siteDir, { detected, publishDirectory, requestedBuildCommand: input.buildCommand || '' });
  const sourceArtifact = await createSourceArtifactRecord({ uploadId, fileName, zipBuffer, extracted, detected, shellFile, siteName, finalSlug, siteDir, now });

  const sourceRepo = input.repoUrl || input.repositoryUrl || process.env.RENDER_GENERATED_SITES_REPO_URL || '';
  const targetRoot = input.rootDirectory || process.env.RENDER_GENERATED_SITES_ROOT_DIR || `uploaded-sites/${finalSlug}`;
  const githubPublish = await publishGeneratedSiteToGitHub({
    siteDir,
    repoUrl: sourceRepo,
    branch,
    targetRoot,
    commitMessage: `Publish uploaded ZIP site ${finalSlug}`,
  });

  const renderRootDirectory = githubPublish.attempted && !githubPublish.errors?.length ? targetRoot : (input.rootDirectory || process.env.RENDER_GENERATED_SITES_ROOT_DIR || '');
  let renderServiceId = makeId('render_svc_pending');
  let renderDeployId = makeId('render_deploy_pending');
  let render = { configured: renderApiService.configured(), attempted: false, skippedReason: null, githubPublish };
  let providerStatus = 'prepared';
  let status = 'prepared';
  let buildStatus = 'uploaded';
  let currentStep = githubPublish.attempted ? 'ZIP extracted, stored, and published to GitHub' : 'ZIP extracted and stored as source artifact';
  let liveUrl = `https://${finalSlug}.onrender.com`;
  let errorMessage = null;

  if (!sourceRepo) render.skippedReason = 'No GitHub/Render source repository configured. Set RENDER_GENERATED_SITES_REPO_URL or send repoUrl.';
  else if (!githubPublish.attempted) render.skippedReason = githubPublish.skippedReason || 'Extracted ZIP source files were not published to GitHub.';
  else if (githubPublish.errors?.length) render.skippedReason = `GitHub publish completed with ${githubPublish.errors.length} errors.`;
  else if (!renderApiService.configured()) render.skippedReason = 'Render API credentials are missing. Set RENDER_API_KEY and RENDER_OWNER_ID.';
  else {
    try {
      render.attempted = true;
      const serviceResponse = await renderApiService.createService({
        serviceName: finalSlug,
        serviceType,
        plan,
        repoUrl: sourceRepo,
        branch,
        rootDirectory: renderRootDirectory,
        buildCommand,
        outputDirectory: publishDirectory,
        sourceReference: sourceRepo,
      });
      renderServiceId = serviceResponse?.service?.id || serviceResponse?.id || renderServiceId;
      const deployResponse = await renderApiService.triggerDeploy(renderServiceId, { deployMode: 'build_and_deploy' });
      renderDeployId = deployResponse?.deploy?.id || deployResponse?.id || renderDeployId;
      providerStatus = deployResponse?.deploy?.status || deployResponse?.status || 'accepted';
      status = renderDeployId ? 'building' : 'preparing';
      buildStatus = renderDeployId ? 'queued' : 'accepted';
      currentStep = renderDeployId ? 'Queued in Render' : 'Sent to Render';
      liveUrl = serviceResponse?.service?.serviceDetails?.url || serviceResponse?.service?.url || serviceResponse?.url || liveUrl;
      render.serviceResponse = serviceResponse;
      render.deployResponse = deployResponse;
    } catch (error) {
      providerStatus = 'handoff_failed';
      status = 'deployed_unverified';
      buildStatus = 'uploaded';
      currentStep = 'ZIP extracted and stored; Render handoff failed';
      errorMessage = error.message || 'Render handoff failed.';
      render.error = { message: error.message, status: error.status, details: error.details || null };
    }
  }

  const generatedSite = {
    siteDir,
    sourceType: 'uploaded-zip-source-artifact',
    framework: detected.framework,
    packageManager: detected.packageManager,
    buildCommand,
    publishDirectory,
    shellFile: shellFile.relativePath,
    files: extracted.files,
    ignoredFiles: extracted.ignoredFiles,
    removedPackageArtifacts: extracted.removedPackageArtifacts,
    uploadedFileName: fileName,
    uploadedAt: now,
    sourceArtifact,
  };

  await mutateHostingStore((store) => {
    store.deployments.unshift({
      id: deploymentId,
      deploymentId,
      siteId: uploadId,
      serviceName: finalSlug,
      siteName,
      serviceType,
      plan,
      provider: 'render',
      providerStatus,
      status,
      buildStatus,
      currentStep,
      source: 'zip-upload',
      sourceReference: fileName,
      renderServiceId,
      renderDeployId,
      liveUrl,
      verifiedUrl: null,
      urlReachable: false,
      errorMessage,
      deploymentLogsReference: deploymentId,
      generatedSite,
      render,
      environmentConfiguration: {
        environment,
        branch,
        rootDirectory: renderRootDirectory || siteDir,
        buildCommand,
        outputDirectory: publishDirectory,
        framework: detected.framework,
        sourceRepository: sourceRepo || null,
        providerTarget: 'render',
      },
      environmentVariablesMetadata: [],
      diskMetadata: [],
      domainMetadata: [],
      createdAt: now,
      updatedAt: now,
      lastDeployedAt: null,
    });

    const logs = [
      makeLog(`ZIP upload received: ${fileName}.`, 'info'),
      makeLog(`Extracted ${extracted.files.length} deployable files into ${siteDir}.`, 'ok'),
      makeLog(`Removed/ignored ${extracted.ignoredFiles.length} package, build, or unsafe artifacts.`, 'info'),
      makeLog(`Stored ZIP source artifact manifest at ${sourceArtifact.manifestPath}.`, 'ok'),
      makeLog(`Render shell handoff file written: ${shellFile.relativePath}.`, 'ok'),
      makeLog(`Detected project: ${detected.framework}.`, 'info'),
      makeLog(`Render build command prepared: ${buildCommand}.`, 'info'),
      makeLog(`Render publish directory prepared: ${publishDirectory}.`, 'info'),
    ];
    if (githubPublish.attempted) logs.push(makeLog(`Published ${githubPublish.publishedCount || 0} source files to GitHub repo ${githubPublish.repository} at ${githubPublish.targetRoot || '(root)'}.`, githubPublish.errors?.length ? 'warn' : 'ok'));
    if (!githubPublish.attempted) logs.push(makeLog(githubPublish.skippedReason || 'GitHub publish skipped.', 'warn'));
    if (githubPublish.errors?.length) logs.push(makeLog(`GitHub publish errors: ${githubPublish.errors.map(e => `${e.path}: ${e.message}`).join('; ')}`, 'warn'));
    if (render.attempted && !errorMessage) logs.push(makeLog(`Render deploy ${renderDeployId} started for ${finalSlug}.`, 'ok'));
    if (render.attempted && errorMessage) logs.push(makeLog(`Render handoff failed: ${errorMessage}`, 'warn'));
    if (!render.attempted) logs.push(makeLog(render.skippedReason || 'Render handoff skipped.', 'warn'));
    store.logs[deploymentId] = logs;
  });

  return {
    status,
    deploymentId,
    siteId: uploadId,
    generatedSite,
    render,
    liveUrl,
    message: render.attempted && !errorMessage ? 'ZIP extracted, stored, published to GitHub, and Render deployment started.' : 'ZIP extracted and stored. Hosting record created. Check Hosting logs for GitHub/Render configuration status.',
  };
}

async function extractZipSafely(zipBuffer, destination) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter(entry => !entry.isDirectory);
  if (entries.length === 0) throw badRequest('ZIP does not contain deployable files.');
  if (entries.length > MAX_EXTRACTED_FILES) throw badRequest(`ZIP contains too many files. Max is ${MAX_EXTRACTED_FILES}.`);

  const rootPrefix = detectRootPrefix(entries.map(entry => entry.entryName));
  const files = [];
  const ignoredFiles = [];
  const removedPackageArtifacts = [];

  for (const entry of entries) {
    if (entry.header.size > MAX_ENTRY_BYTES) throw badRequest(`ZIP entry is too large: ${entry.entryName}`);
    const relativeName = cleanZipPath(rootPrefix ? entry.entryName.slice(rootPrefix.length) : entry.entryName);
    if (!relativeName || relativeName.endsWith('/')) continue;
    const ignoreReason = getIgnoredSourceReason(relativeName);
    if (ignoreReason) {
      ignoredFiles.push({ path: relativeName, reason: ignoreReason });
      if (ignoreReason === 'package-artifact') removedPackageArtifacts.push(relativeName);
      continue;
    }
    const outputPath = resolve(destination, relativeName);
    if (!outputPath.startsWith(destination)) throw badRequest(`Unsafe ZIP path detected: ${entry.entryName}`);
    await mkdir(join(outputPath, '..'), { recursive: true });
    await writeFile(outputPath, entry.getData());
    files.push(relativeName);
  }

  if (!files.some(name => /(^|\/)package\.json$/i.test(name) || /(^|\/)index\.html$/i.test(name))) {
    throw badRequest('ZIP must include package.json or index.html at the project root.');
  }

  return { files, ignoredFiles, removedPackageArtifacts };
}

async function writeRenderShellFile(siteDir, { detected, publishDirectory, requestedBuildCommand }) {
  const relativePath = 'glondia-render-build.sh';
  const command = requestedBuildCommand || defaultProjectBuildCommand(detected);
  const content = `#!/usr/bin/env bash
set -euo pipefail

echo "Glondia ZIP source artifact build started"
echo "Framework: ${detected.framework}"
echo "Package manager: ${detected.packageManager}"

if [ -f package.json ]; then
  echo "Installing dependencies with npm ci/npm install inside Render build environment"
  if [ -f package-lock.json ]; then npm ci; else npm install; fi
  echo "Running project build command"
  ${command}
else
  echo "No package.json found; treating upload as static HTML"
  mkdir -p ${publishDirectory}
  shopt -s extglob
  cp -R !("${publishDirectory}"|"glondia-render-build.sh"|"glondia-upload-artifact.json") ${publishDirectory}/ 2>/dev/null || true
fi

echo "Glondia ZIP source artifact build finished"
`;
  await writeFile(join(siteDir, relativePath), content, 'utf8');
  return { relativePath, command };
}

async function createSourceArtifactRecord({ uploadId, fileName, zipBuffer, extracted, detected, shellFile, siteName, finalSlug, siteDir, now }) {
  const manifest = {
    uploadId,
    fileName,
    siteName,
    slug: finalSlug,
    sourceType: 'zip-upload-extracted-source',
    storageMode: 'database-artifact-record',
    extractedRoot: siteDir,
    originalZipBytes: zipBuffer.length,
    deployableFileCount: extracted.files.length,
    ignoredFileCount: extracted.ignoredFiles.length,
    deployableFiles: extracted.files,
    ignoredFiles: extracted.ignoredFiles,
    removedPackageArtifacts: extracted.removedPackageArtifacts,
    framework: detected.framework,
    packageManager: detected.packageManager,
    shellFile: shellFile.relativePath,
    createdAt: now,
  };
  const manifestPath = join(siteDir, 'glondia-upload-artifact.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  const shellContent = await readFile(join(siteDir, shellFile.relativePath), 'utf8');
  return {
    ...manifest,
    manifestPath,
    shellContent,
  };
}

function buildShellHandoffCommand(requestedBuildCommand, detected) {
  if (requestedBuildCommand && String(requestedBuildCommand).trim()) return `bash glondia-render-build.sh`;
  if (detected.packageManager === 'npm') return `bash glondia-render-build.sh`;
  return `bash glondia-render-build.sh`;
}

function defaultProjectBuildCommand(detected) {
  if (detected.packageManager === 'npm') return 'npm run build';
  return 'echo "Static site prepared"';
}

function detectRootPrefix(names) {
  const firstParts = names.map(name => cleanZipPath(name).split('/')[0]).filter(Boolean);
  if (!firstParts.length) return '';
  const first = firstParts[0];
  return firstParts.every(part => part === first) ? `${first}/` : '';
}

function detectProject(files) {
  const hasPackage = files.some(name => name === 'package.json');
  const hasVite = files.some(name => /^vite\.config\./i.test(name));
  const hasIndex = files.some(name => name === 'index.html');
  return {
    framework: hasVite ? 'Vite' : hasPackage ? 'Node static app' : hasIndex ? 'Static HTML' : 'Unknown static site',
    packageManager: hasPackage ? 'npm' : 'none',
  };
}

function getIgnoredSourceReason(relativeName) {
  const normalized = cleanZipPath(relativeName);
  if (normalized.includes('node_modules/') || normalized.startsWith('node_modules/')) return 'package-artifact';
  if (['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'npm-debug.log', 'yarn-error.log'].includes(normalized)) return 'package-artifact';
  if (IGNORED_SOURCE_PATTERNS.some(pattern => normalized === pattern || normalized.includes(pattern))) return 'ignored-build-or-system-artifact';
  return '';
}

function cleanZipPath(value = '') {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

function sanitizeFileName(value = '') {
  return String(value || 'upload.zip').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120) || 'upload.zip';
}

function slugify(value) {
  return String(value || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
}

function makeLog(message, level = 'info') {
  return { id: makeId('log'), level, message, timestamp: nowIso(), createdAt: nowIso() };
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}
