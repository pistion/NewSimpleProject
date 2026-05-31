/**
 * githubClientImport.stage.js — 02-GITHUB-CLIENT-IMPORT-MOUNTAIN
 *
 * Imports a CLIENT GitHub repository into local staging using GitHub App
 * installation credentials. This is the read side of the controlled-source
 * pipeline: the client repo is only an import source, never a Render source.
 *
 *   client repo URL
 *   → resolve owner/repo/branch
 *   → download repo archive (client installation token / public / platform fallback)
 *   → extract to DATA_DIR/github-imports/<deployment-safe-id>
 *   → clean unsafe files/folders
 *   → optionally select a root subdirectory (monorepo support)
 *   → return localDir + source metadata
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import AdmZip from 'adm-zip';
import {
  shouldIgnoreEntry,
  cleanZipPath,
  detectRootPrefix,
  MAX_EXTRACTED_FILES,
  MAX_ENTRY_BYTES,
} from '../../00-SHARED/fileRules.js';
import { normalizeRoot } from '../../00-SHARED/runtimeConfig.js';
import {
  getClientInstallationToken,
  getPlatformInstallationToken,
  githubAppConfigured,
} from '../03-GITHUB-SOURCE-MOUNTAIN/githubAppAuth.stage.js';

/**
 * Import a client GitHub repository into local staging.
 *
 * @param {object} normalized  Output of normalizeGithubLinkInput, plus optional
 *                             clientInstallationId / rootDirectory passthrough.
 * @returns {Promise<ImportedSource>}
 */
export async function importClientGithubRepo(normalized = {}) {
  const { parsedRepo, branch } = normalized;
  if (!parsedRepo?.owner || !parsedRepo?.repo) {
    throw importError('A valid GitHub owner/repo is required to import client source.', 'github_client_import', 400);
  }

  const input = normalized.input || {};
  const clientInstallationId = input.clientInstallationId || input.githubInstallationId || normalized.clientInstallationId || null;
  const rootDirectory = normalizeRoot(input.rootDirectory || input.rootDir || normalized.rootDirectory || '');

  const token = await resolveImportToken({ parsedRepo, clientInstallationId });

  const buffer = await downloadGithubArchive({
    owner: parsedRepo.owner,
    repo: parsedRepo.repo,
    branch,
    token,
  });

  const destination = importStagingDir(normalized);
  const extracted = await extractGithubArchive(buffer, destination);
  await cleanImportedSource(destination);
  const localDir = await selectRootDirectory(destination, rootDirectory);

  const files = await listRelativeFiles(localDir);
  if (!files.length) {
    throw importError('Imported client repository contained no deployable files after cleanup.', 'github_client_import', 422);
  }

  return {
    sourceType: 'github-client-import',
    originalRepoUrl: normalized.repoUrl,
    originalFullName: parsedRepo.fullName || `${parsedRepo.owner}/${parsedRepo.repo}`,
    originalBranch: branch,
    originalRootDirectory: rootDirectory,
    localDir,
    files,
    importedAt: new Date().toISOString(),
    clientInstallationId: clientInstallationId || null,
    authenticated: Boolean(token),
  };
}

/**
 * Pick the best token to read the client repo:
 *  - client installation token when a clientInstallationId is supplied,
 *  - platform installation token as a fallback when the App is configured,
 *  - null (unauthenticated) for public repos.
 *
 * Private repos require an installation token; we surface a clear error if none.
 */
async function resolveImportToken({ parsedRepo, clientInstallationId }) {
  if (clientInstallationId) {
    return getClientInstallationToken(clientInstallationId);
  }
  // No client installation. Try platform App token as a courtesy (works only if
  // the platform App is also installed on the source repo), else go anonymous.
  if (githubAppConfigured() && process.env.GITHUB_GLONDIASITES_INSTALLATION_ID) {
    try {
      return await getPlatformInstallationToken();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Download a GitHub repository archive (zipball) as a Buffer.
 * Works for both authenticated (private) and anonymous (public) access.
 */
export async function downloadGithubArchive({ owner, repo, branch, token }) {
  const ref = encodeURIComponent(branch || 'main');
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/zipball/${ref}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'glondiasites-render-deploy-lab',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 404) {
      throw importError(
        `Client repository ${owner}/${repo}@${branch} was not found or is private. For private repos pass clientInstallationId.`,
        'github_client_import',
        404,
      );
    }
    throw importError(`GitHub archive download failed ${res.status}: ${body}`, 'github_client_import', res.status || 502);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Extract a GitHub zipball Buffer into a destination directory.
 * GitHub zipballs nest everything under an `owner-repo-sha/` prefix, which is
 * stripped here. Ignored folders/files are filtered via shared file rules.
 */
export async function extractGithubArchive(buffer, destination) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  if (!entries.length) throw importError('Client repository archive contained no files.', 'github_client_import', 422);

  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });

  const rootPrefix = detectRootPrefix(entries.map((entry) => entry.entryName));
  const root = path.resolve(destination);
  const files = [];

  for (const entry of entries) {
    const relativeName = cleanZipPath(rootPrefix ? entry.entryName.slice(rootPrefix.length) : entry.entryName);
    if (!relativeName) continue;
    if (shouldIgnoreEntry(relativeName).ignore) continue;
    if (entry.header.size > MAX_ENTRY_BYTES) {
      throw importError(`Client repository entry is too large: ${relativeName}.`, 'github_client_import', 413);
    }
    if (files.length >= MAX_EXTRACTED_FILES) {
      throw importError(`Client repository has too many files after cleanup. Max: ${MAX_EXTRACTED_FILES}.`, 'github_client_import', 413);
    }
    const outputPath = path.resolve(root, relativeName);
    if (!isInside(root, outputPath)) {
      throw importError(`Client repository entry path is not allowed: ${entry.entryName}`, 'github_client_import', 400);
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, entry.getData());
    files.push(relativeName);
  }

  return { files, rootPrefix };
}

/**
 * Remove unsafe / non-deployable artifacts that may have survived archive
 * extraction. The shared file rules already skip most of these during extract;
 * this is a defensive second pass for any leftovers.
 */
export async function cleanImportedSource(directory) {
  const unsafe = ['.git', 'node_modules', '.env', '.env.local', '.env.production', '.env.development', '.cache', '.turbo', '.vercel', '.netlify'];
  for (const name of unsafe) {
    await fs.rm(path.join(directory, name), { recursive: true, force: true }).catch(() => {});
  }
  return directory;
}

/**
 * Resolve the effective source directory. When a rootDirectory is provided
 * (monorepo subfolder), validate it stays inside the staging root and return it.
 */
export async function selectRootDirectory(directory, rootDirectory) {
  const cleaned = normalizeRoot(rootDirectory || '');
  if (!cleaned) return directory;
  const target = path.resolve(directory, cleaned);
  if (!isInside(path.resolve(directory), target)) {
    throw importError(`rootDirectory is not allowed: ${rootDirectory}`, 'github_client_import', 400);
  }
  const stat = await fs.stat(target).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw importError(`rootDirectory not found in imported source: ${rootDirectory}`, 'github_client_import', 422);
  }
  return target;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function importStagingDir(normalized) {
  const base = process.env.DATA_DIR || os.tmpdir();
  const safeId = String(normalized.deploymentSafeId || normalized.siteName || 'import')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'import';
  return path.join(base, 'github-imports', `${safeId}-${Date.now().toString(36)}`);
}

async function listRelativeFiles(dir) {
  const out = [];
  const walk = async (current) => {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.push(path.relative(dir, full).replace(/\\/g, '/'));
    }
  };
  await walk(dir);
  return out;
}

function isInside(root, child) {
  const relative = path.relative(root, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function importError(message, stage, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.stage = stage;
  error.expose = true;
  return error;
}
