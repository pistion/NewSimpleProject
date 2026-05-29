import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import AdmZip from 'adm-zip';
import { makeId, mutateHostingStore, nowIso } from './hostingStore.js';
import renderApiService from './renderApiService.js';

// ── Provider constants ──────────────────────────────────────────────────────
// ZIP uploads are website/app hosting → always Render.
// Flow: upload ZIP → extract → store on disk → hand off to Render API.
// No GitHub intermediary — files are stored in DATA_DIR and Render deploys
// from the repo URL the user provides (or RENDER_GENERATED_SITES_REPO_URL).
const HOSTING_PROVIDER = 'render';
// VPS_PROVIDER = 'vultr' — lives in vps routes/services only

const rootDir = resolve(process.cwd());
const dataDir = resolve(process.env.DATA_DIR || join(rootDir, '.glondia-data'));
const uploadedRoot = join(dataDir, 'uploaded-sites');

// ── Limits (applied AFTER cleanup, not before) ─────────────────────────────
const MAX_ZIP_BYTES       = Number(process.env.ZIP_UPLOAD_MAX_BYTES       || 100 * 1024 * 1024); // 100 MB
const MAX_EXTRACTED_FILES = Number(process.env.ZIP_UPLOAD_MAX_FILES       || 5000);               // 5000 deployable files
const MAX_ENTRY_BYTES     = Number(process.env.ZIP_UPLOAD_MAX_ENTRY_BYTES || 25 * 1024 * 1024);  // 25 MB per entry

// ── Folders/files to ALWAYS ignore (dangerous, heavy, or non-deployable) ────
const IGNORED_FOLDER_PREFIXES = [
  'node_modules/',
  '.git/',
  '.next/cache/',
  '.next/server/cache/',
  '.vercel/',
  '.netlify/',
  'coverage/',
  '.cache/',
  '.parcel-cache/',
  '.turbo/',
  '.vite/',
  'dist/.vite/',
  '__MACOSX/',
  '.idea/',
  '.vscode/',
  '.pnpm-store/',
  '.yarn/cache/',
];

const IGNORED_EXACT_FILES = [
  '.DS_Store',
  'Thumbs.db',
  'npm-debug.log',
  'yarn-error.log',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
];

// Untrusted user-uploaded executable scripts — never deploy these
const UNTRUSTED_SCRIPT_EXTENSIONS = ['.sh', '.bat', '.cmd', '.ps1'];
// Exception: the generated backend shell file is always kept
const GENERATED_SHELL_FILE = 'glondia-render-build.sh';

// ── Project type enum ───────────────────────────────────────────────────────
const PROJECT_TYPE = {
  VITE_SOURCE:     'vite-source',
  NODE_SOURCE:     'node-source',
  STATIC_ROOT:     'static-root-html',
  PREBUILT_DIST:   'prebuilt-dist',
  PREBUILT_BUILD:  'prebuilt-build',
  UNKNOWN:         'unknown',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions: ignore / safety checks
// ─────────────────────────────────────────────────────────────────────────────

function shouldIgnoreZipEntry(relativeName) {
  const normalized = cleanZipPath(relativeName);
  const lower = normalized.toLowerCase();

  for (const prefix of IGNORED_FOLDER_PREFIXES) {
    if (lower.startsWith(prefix) || lower.includes(`/${prefix}`)) {
      return { ignore: true, reason: `ignored-folder: ${prefix}` };
    }
  }

  const baseName = lower.split('/').pop();
  for (const exact of IGNORED_EXACT_FILES) {
    if (baseName === exact.toLowerCase()) {
      return { ignore: true, reason: `ignored-file: ${exact}` };
    }
  }

  if (isUnsafeExecutable(relativeName)) {
    return { ignore: true, reason: 'untrusted-script' };
  }

  return { ignore: false, reason: '' };
}

function isUnsafeExecutable(relativeName) {
  const normalized = cleanZipPath(relativeName);
  const baseName = normalized.split('/').pop().toLowerCase();
  if (baseName === GENERATED_SHELL_FILE) return false;
  const ext = baseName.substring(baseName.lastIndexOf('.')).toLowerCase();
  return UNTRUSTED_SCRIPT_EXTENSIONS.includes(ext);
}

// ─────────────────────────────────────────────────────────────────────────────
// Source repo resolution — single source of truth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the Render source repo URL from input or environment.
 * This is the repo Render will deploy FROM — the user must configure it.
 */
function resolveRenderSourceRepo(input = {}) {
  return (
    input.repoUrl ||
    input.repositoryUrl ||
    process.env.RENDER_GENERATED_SITES_REPO_URL ||
    process.env.GENERATED_SITES_REPO_URL ||
    ''
  ).trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Config diagnostics — used by GET /api/template-ai/zip/settings
// ─────────────────────────────────────────────────────────────────────────────

export function getZipDeployConfigStatus() {
  const renderApiConfigured = renderApiService.configured();
  const sourceRepo = (process.env.RENDER_GENERATED_SITES_REPO_URL || process.env.GENERATED_SITES_REPO_URL || '').trim();
  const renderSourceRepoConfigured = Boolean(sourceRepo);

  const missing = [];
  if (!renderApiConfigured) missing.push('RENDER_API_KEY and/or RENDER_OWNER_ID');
  if (!renderSourceRepoConfigured) missing.push('RENDER_GENERATED_SITES_REPO_URL');

  return {
    provider: HOSTING_PROVIDER,
    renderApiConfigured,
    renderSourceRepoConfigured,
    missing,
    expectedEnv: [
      'RENDER_API_KEY',
      'RENDER_OWNER_ID',
      'RENDER_GENERATED_SITES_REPO_URL',
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function deployZipSite(input = {}) {
  const fileName = sanitizeFileName(input.fileName || 'uploaded-site.zip');
  const base64 = String(input.fileBase64 || '').replace(/^data:.*?;base64,/, '');
  if (!base64) throw badRequest('fileBase64 is required.', 'ZIP_NO_DATA');

  const zipBuffer = Buffer.from(base64, 'base64');
  if (!zipBuffer.length) throw badRequest('Uploaded ZIP is empty.', 'ZIP_EMPTY');
  if (zipBuffer.length > MAX_ZIP_BYTES) throw badRequest(`ZIP is too large. Max size is ${Math.round(MAX_ZIP_BYTES / 1024 / 1024)} MB.`, 'ZIP_TOO_LARGE');

  const siteName = String(input.siteName || fileName.replace(/\.zip$/i, '') || 'uploaded-site').trim();
  const finalSlug = slugify(input.slug || siteName);
  const branch = input.branch || 'main';
  const serviceType = input.serviceType || 'static_site';
  const plan = input.plan || 'starter';
  const environment = input.environment || 'production';
  const deploymentId = makeId('dep');
  const uploadId = makeId('zip');
  const siteDir = join(uploadedRoot, uploadId);
  const now = nowIso();

  console.log(`[zip-deploy] ZIP received: ${fileName}, size=${formatBytes(zipBuffer.length)}`);

  await rm(siteDir, { recursive: true, force: true });
  await mkdir(siteDir, { recursive: true });

  // 1. Extract safely — filter FIRST, count AFTER
  const extracted = await extractZipSafely(zipBuffer, siteDir);
  console.log(`[zip-deploy] Raw entries: ${extracted.rawEntryCount}, ignored: ${extracted.ignoredFiles.length}, deployable: ${extracted.files.length}`);
  if (extracted.ignoredFolderExamples.length > 0) {
    console.log(`[zip-deploy] Ignored folder examples: ${extracted.ignoredFolderExamples.join(', ')}`);
  }

  // 2. Detect project type
  const detected = detectProject(extracted.files);
  console.log(`[zip-deploy] Detected project type: ${detected.type} (framework: ${detected.framework})`);

  // 3. Determine publish directory based on project type
  const publishDirectory = resolvePublishDirectory(detected, input.publishDirectory);
  console.log(`[zip-deploy] Publish directory: ${publishDirectory}`);

  // 4. Write the deterministic Render build shell file
  const shellFile = await writeRenderShellFile(siteDir, { detected, publishDirectory, requestedBuildCommand: input.buildCommand || '' });
  console.log(`[zip-deploy] Shell file written: ${shellFile.relativePath}`);

  // 5. Create source artifact record
  const sourceArtifact = await createSourceArtifactRecord({
    uploadId, fileName, zipBuffer, extracted, detected, shellFile,
    siteName, finalSlug, publishDirectory, siteDir, now,
  });

  // 6. Render handoff — direct, no GitHub intermediary
  const sourceRepo = resolveRenderSourceRepo(input);
  const renderRootDirectory = input.rootDirectory || process.env.RENDER_GENERATED_SITES_ROOT_DIR || '';
  const buildCommand = 'bash glondia-render-build.sh';

  let renderServiceId = makeId('render_svc_pending');
  let renderDeployId = makeId('render_deploy_pending');
  let render = { configured: renderApiService.configured(), attempted: false, skippedReason: null };
  let providerStatus = 'prepared';
  let status = 'prepared';
  let buildStatus = 'uploaded';
  let currentStep = 'ZIP extracted and stored';
  let liveUrl = `https://${finalSlug}.onrender.com`;
  let errorMessage = null;

  if (!renderApiService.configured()) {
    render.skippedReason = 'Render API credentials are missing. Set RENDER_API_KEY and RENDER_OWNER_ID.';
  } else if (!sourceRepo) {
    render.skippedReason = 'Missing source repository URL. Set RENDER_GENERATED_SITES_REPO_URL in environment or enter a repository URL in the deploy form.';
  } else {
    try {
      console.log(`[zip-deploy] Starting Render handoff for ${finalSlug}...`);
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
      console.log(`[zip-deploy] Render deploy ${renderDeployId} started`);
    } catch (error) {
      providerStatus = 'handoff_failed';
      status = 'deployed_unverified';
      buildStatus = 'uploaded';
      currentStep = 'ZIP extracted and stored; Render handoff failed';
      errorMessage = error.message || 'Render handoff failed.';
      render.error = { message: error.message, status: error.status, details: error.details || null };
      console.log(`[zip-deploy] Render handoff failed: ${errorMessage}`);
    }
  }

  if (render.skippedReason) {
    console.log(`[zip-deploy] Render handoff skipped: ${render.skippedReason}`);
  }

  const targetRoot = renderRootDirectory || `uploaded-sites/${finalSlug}`;
  const generatedSite = {
    siteDir,
    sourceType: 'uploaded-zip-source-artifact',
    projectType: detected.type,
    framework: detected.framework,
    packageManager: detected.packageManager,
    buildCommand,
    publishDirectory,
    shellFile: shellFile.relativePath,
    files: extracted.files,
    ignoredFiles: extracted.ignoredFiles,
    uploadedFileName: fileName,
    uploadedAt: now,
    sourceArtifact,
    githubTargetRoot: targetRoot,
    sourceRepository: sourceRepo || null,
  };

  // 7. Persist deployment record + logs
  await mutateHostingStore((store) => {
    if (!store.uploadedSiteArtifacts) store.uploadedSiteArtifacts = [];
    store.uploadedSiteArtifacts.push({
      uploadId,
      deploymentId,
      originalFileName: fileName,
      originalZipBytes: zipBuffer.length,
      extractedPath: siteDir,
      rawEntryCount: extracted.rawEntryCount,
      deployableFiles: extracted.files,
      ignoredFiles: extracted.ignoredFiles,
      detectedProjectType: detected.type,
      chosenBuildCommand: buildCommand,
      chosenPublishDirectory: publishDirectory,
      generatedShellFilePath: shellFile.relativePath,
      createdAt: now,
    });

    store.deployments.unshift({
      id: deploymentId,
      deploymentId,
      siteId: uploadId,
      serviceName: finalSlug,
      siteName,
      serviceType,
      plan,
      provider: HOSTING_PROVIDER,
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
        rootDirectory: renderRootDirectory || targetRoot,
        buildCommand,
        outputDirectory: publishDirectory,
        framework: detected.framework,
        sourceRepository: sourceRepo || null,
        providerTarget: HOSTING_PROVIDER,
      },
      environmentVariablesMetadata: [],
      diskMetadata: [],
      domainMetadata: [],
      createdAt: now,
      updatedAt: now,
      lastDeployedAt: null,
    });

    const logs = [
      makeLog(`ZIP upload received: ${fileName} (${formatBytes(zipBuffer.length)}).`, 'info'),
      makeLog(`Raw ZIP entries: ${extracted.rawEntryCount}. Ignored: ${extracted.ignoredFiles.length}. Deployable: ${extracted.files.length}.`, 'info'),
      ...(extracted.ignoredFolderExamples.length > 0
        ? [makeLog(`Ignored folder examples: ${extracted.ignoredFolderExamples.join(', ')}.`, 'info')]
        : []),
      makeLog(`Extracted ${extracted.files.length} deployable files into ${siteDir}.`, 'ok'),
      makeLog(`Detected project type: ${detected.type} (${detected.framework}).`, 'info'),
      makeLog(`Publish directory: ${publishDirectory}.`, 'info'),
      makeLog(`Render build command: ${buildCommand}.`, 'info'),
      makeLog(`Shell file written: ${shellFile.relativePath}.`, 'ok'),
      makeLog(`Source artifact manifest stored at ${sourceArtifact.manifestPath}.`, 'ok'),
    ];
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
    message: render.attempted && !errorMessage
      ? 'ZIP extracted, stored, and Render deployment started.'
      : 'ZIP extracted and stored. Hosting record created. Check Hosting logs for Render configuration status.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validate-only endpoint (no deployment)
// ─────────────────────────────────────────────────────────────────────────────

export async function validateZipSite(input = {}) {
  const fileName = sanitizeFileName(input.fileName || 'uploaded-site.zip');
  const base64 = String(input.fileBase64 || '').replace(/^data:.*?;base64,/, '');
  if (!base64) throw badRequest('fileBase64 is required.', 'ZIP_NO_DATA');

  const zipBuffer = Buffer.from(base64, 'base64');
  if (!zipBuffer.length) throw badRequest('Uploaded ZIP is empty.', 'ZIP_EMPTY');
  if (zipBuffer.length > MAX_ZIP_BYTES) throw badRequest(`ZIP is too large. Max size is ${Math.round(MAX_ZIP_BYTES / 1024 / 1024)} MB.`, 'ZIP_TOO_LARGE');

  const tmpDir = join(dataDir, 'zip-validate-tmp', makeId('val'));
  await mkdir(tmpDir, { recursive: true });

  try {
    const extracted = await extractZipSafely(zipBuffer, tmpDir);
    const detected = detectProject(extracted.files);
    const publishDirectory = resolvePublishDirectory(detected);

    return {
      valid: true,
      fileName,
      zipBytes: zipBuffer.length,
      rawEntryCount: extracted.rawEntryCount,
      fileCount: extracted.files.length,
      ignoredFileCount: extracted.ignoredFiles.length,
      detectedProjectType: detected.type,
      framework: detected.framework,
      packageManager: detected.packageManager,
      publishDirectory,
      deployableFiles: extracted.files,
      ignoredFiles: extracted.ignoredFiles,
      ignoredFolderExamples: extracted.ignoredFolderExamples,
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ZIP extraction — filter FIRST, count AFTER, keeps dist/build/public/assets
// ─────────────────────────────────────────────────────────────────────────────

async function extractZipSafely(zipBuffer, destination) {
  const zip = new AdmZip(zipBuffer);
  const allEntries = zip.getEntries().filter(entry => !entry.isDirectory);
  const rawEntryCount = allEntries.length;

  if (rawEntryCount === 0) throw badRequest('ZIP does not contain any files.', 'ZIP_NO_FILES');

  console.log(`[zip-extract] Raw ZIP file entries (before filtering): ${rawEntryCount}`);

  const rootPrefix = detectRootPrefix(allEntries.map(entry => entry.entryName));
  const files = [];
  const ignoredFiles = [];
  const ignoredFolderSet = new Set();

  for (const entry of allEntries) {
    const relativeName = cleanZipPath(rootPrefix ? entry.entryName.slice(rootPrefix.length) : entry.entryName);
    if (!relativeName || relativeName.endsWith('/')) continue;

    const ignoreCheck = shouldIgnoreZipEntry(relativeName);
    if (ignoreCheck.ignore) {
      ignoredFiles.push({ path: relativeName, reason: ignoreCheck.reason });
      const folderMatch = ignoreCheck.reason.match(/^ignored-folder: (.+)/);
      if (folderMatch) ignoredFolderSet.add(folderMatch[1]);
      continue;
    }

    if (entry.header.size > MAX_ENTRY_BYTES) {
      throw badRequest(
        `ZIP entry is too large: ${entry.entryName} (${formatBytes(entry.header.size)}). Max per file is ${formatBytes(MAX_ENTRY_BYTES)}.`,
        'ZIP_ENTRY_TOO_LARGE',
      );
    }

    const outputPath = resolve(destination, relativeName);
    if (!outputPath.startsWith(destination)) {
      throw badRequest(`Unsafe ZIP path detected: ${entry.entryName}`, 'ZIP_PATH_TRAVERSAL');
    }

    await mkdir(join(outputPath, '..'), { recursive: true });
    await writeFile(outputPath, entry.getData());
    files.push(relativeName);
  }

  console.log(`[zip-extract] After filtering: ${files.length} deployable, ${ignoredFiles.length} ignored`);

  if (files.length > MAX_EXTRACTED_FILES) {
    const err = badRequest(
      `ZIP has too many deployable files after cleanup. Deployable files: ${files.length}. Max: ${MAX_EXTRACTED_FILES}.`,
      'ZIP_TOO_MANY_DEPLOYABLE_FILES',
    );
    err.details = {
      rawEntries: rawEntryCount,
      ignoredFiles: ignoredFiles.length,
      deployableFiles: files.length,
      maxDeployableFiles: MAX_EXTRACTED_FILES,
    };
    throw err;
  }

  const hasDeployableEntry = files.some(name =>
    name === 'package.json' ||
    name === 'index.html' ||
    name === 'dist/index.html' ||
    name === 'build/index.html' ||
    name === 'public/index.html'
  );
  if (!hasDeployableEntry) {
    throw badRequest(
      'ZIP must contain package.json, index.html, dist/index.html, build/index.html, or public/index.html.',
      'ZIP_NO_DEPLOYABLE_ENTRY',
    );
  }

  const ignoredFolderExamples = Array.from(ignoredFolderSet).slice(0, 10);

  return { files, ignoredFiles, rawEntryCount, ignoredFolderExamples };
}

// ─────────────────────────────────────────────────────────────────────────────
// Project type detection
// ─────────────────────────────────────────────────────────────────────────────

function detectProject(files) {
  const hasPackage     = files.some(n => n === 'package.json');
  const hasViteConfig  = files.some(n => /^vite\.config\.(js|ts|mjs|mts|cjs)$/i.test(n));
  const hasRootIndex   = files.some(n => n === 'index.html');
  const hasDistIndex   = files.some(n => n === 'dist/index.html');
  const hasBuildIndex  = files.some(n => n === 'build/index.html');
  const hasLockFile    = files.some(n => n === 'package-lock.json');

  if (hasPackage && hasViteConfig) return { type: PROJECT_TYPE.VITE_SOURCE, framework: 'Vite', packageManager: 'npm', hasLockFile };
  if (hasPackage) return { type: PROJECT_TYPE.NODE_SOURCE, framework: 'Node static app', packageManager: 'npm', hasLockFile };
  if (hasDistIndex) return { type: PROJECT_TYPE.PREBUILT_DIST, framework: 'Prebuilt (dist)', packageManager: 'none', hasLockFile: false };
  if (hasBuildIndex) return { type: PROJECT_TYPE.PREBUILT_BUILD, framework: 'Prebuilt (build)', packageManager: 'none', hasLockFile: false };
  if (hasRootIndex) return { type: PROJECT_TYPE.STATIC_ROOT, framework: 'Static HTML', packageManager: 'none', hasLockFile: false };
  return { type: PROJECT_TYPE.UNKNOWN, framework: 'Unknown', packageManager: 'none', hasLockFile: false };
}

function resolvePublishDirectory(detected, userOverride) {
  if (userOverride && String(userOverride).trim()) return String(userOverride).trim();
  switch (detected.type) {
    case PROJECT_TYPE.PREBUILT_BUILD: return 'build';
    case PROJECT_TYPE.PREBUILT_DIST:  return 'dist';
    default:                          return 'dist';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Render build shell file — deterministic, never trusts user scripts
// ─────────────────────────────────────────────────────────────────────────────

async function writeRenderShellFile(siteDir, { detected, publishDirectory, requestedBuildCommand }) {
  const relativePath = 'glondia-render-build.sh';
  const userBuild = String(requestedBuildCommand || '').trim();
  const buildCmd = userBuild || defaultBuildCommand(detected);

  let scriptBody;

  switch (detected.type) {
    case PROJECT_TYPE.VITE_SOURCE:
    case PROJECT_TYPE.NODE_SOURCE:
      scriptBody = `
echo "Source project detected (${detected.framework})"
if [ -f package.json ]; then
  echo "Installing dependencies..."
  ${detected.hasLockFile ? 'npm ci' : 'npm install'}
  echo "Running build: ${buildCmd}"
  ${buildCmd}
else
  echo "ERROR: package.json expected but not found"
  exit 1
fi
`;
      break;

    case PROJECT_TYPE.STATIC_ROOT:
      scriptBody = `
echo "Static HTML site detected (no package.json)"
mkdir -p "${publishDirectory}"
shopt -s extglob dotglob
cp -R !("${publishDirectory}"|"glondia-render-build.sh"|"glondia-upload-artifact.json") "${publishDirectory}/" 2>/dev/null || true
shopt -u dotglob
echo "Static files copied to ${publishDirectory}/"
`;
      break;

    case PROJECT_TYPE.PREBUILT_DIST:
      scriptBody = `
echo "Prebuilt site detected in dist/"
if [ ! -f dist/index.html ]; then
  echo "ERROR: dist/index.html not found"
  exit 1
fi
echo "dist/index.html confirmed — nothing to build"
`;
      break;

    case PROJECT_TYPE.PREBUILT_BUILD:
      scriptBody = `
echo "Prebuilt site detected in build/"
if [ ! -f build/index.html ]; then
  echo "ERROR: build/index.html not found"
  exit 1
fi
echo "build/index.html confirmed — nothing to build"
`;
      break;

    default:
      scriptBody = `
echo "Unknown project type — attempting static copy"
mkdir -p "${publishDirectory}"
shopt -s extglob dotglob
cp -R !("${publishDirectory}"|"glondia-render-build.sh"|"glondia-upload-artifact.json") "${publishDirectory}/" 2>/dev/null || true
shopt -u dotglob
`;
  }

  const content = `#!/usr/bin/env bash
set -euo pipefail

echo "=== Glondia ZIP source artifact build ==="
echo "Project type: ${detected.type}"
echo "Framework: ${detected.framework}"
echo "Publish directory: ${publishDirectory}"
${scriptBody.trim()}

echo "=== Glondia build finished ==="
`;
  await writeFile(join(siteDir, relativePath), content, 'utf8');
  return { relativePath, command: 'bash glondia-render-build.sh' };
}

function defaultBuildCommand(detected) {
  if (detected.type === PROJECT_TYPE.VITE_SOURCE || detected.type === PROJECT_TYPE.NODE_SOURCE) return 'npm run build';
  return 'echo "No build step needed"';
}

// ─────────────────────────────────────────────────────────────────────────────
// Source artifact record
// ─────────────────────────────────────────────────────────────────────────────

async function createSourceArtifactRecord({
  uploadId, fileName, zipBuffer, extracted, detected, shellFile,
  siteName, finalSlug, publishDirectory, siteDir, now,
}) {
  const manifest = {
    uploadId,
    fileName,
    siteName,
    slug: finalSlug,
    sourceType: 'zip-upload-extracted-source',
    storageMode: 'database-artifact-record',
    extractedRoot: siteDir,
    originalZipBytes: zipBuffer.length,
    rawEntryCount: extracted.rawEntryCount,
    deployableFileCount: extracted.files.length,
    ignoredFileCount: extracted.ignoredFiles.length,
    deployableFiles: extracted.files,
    ignoredFiles: extracted.ignoredFiles,
    ignoredFolderExamples: extracted.ignoredFolderExamples,
    projectType: detected.type,
    framework: detected.framework,
    packageManager: detected.packageManager,
    publishDirectory,
    shellFile: shellFile.relativePath,
    createdAt: now,
  };
  const manifestPath = join(siteDir, 'glondia-upload-artifact.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  const shellContent = await readFile(join(siteDir, shellFile.relativePath), 'utf8');
  return { ...manifest, manifestPath, shellContent };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function detectRootPrefix(names) {
  const firstParts = names.map(name => cleanZipPath(name).split('/')[0]).filter(Boolean);
  if (!firstParts.length) return '';
  const first = firstParts[0];
  return firstParts.every(part => part === first) ? `${first}/` : '';
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

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function makeLog(message, level = 'info') {
  return { id: makeId('log'), level, message, timestamp: nowIso(), createdAt: nowIso() };
}

function badRequest(message, code = 'ZIP_BAD_REQUEST') {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  error.expose = true;
  return error;
}
