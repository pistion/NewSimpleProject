/**
 * artifactWriter.js — immutable revision artifacts.
 *
 * Layout (under DATA_DIR/builder-artifacts/<revisionId>/):
 *   files/                    generated site files
 *   artifact-manifest.json    file list + per-file SHA-256 + aggregate checksum
 *   plan-snapshot.json        the plan the revision was generated from
 *   answer-sheet.json         the answer sheet the revision was generated from
 *   validation-report.json    output validation + secret scan report
 *
 * The aggregate checksum is deterministic: SHA-256 over the sorted
 * `path\nsize\nsha256\n` lines of every file in files/.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, writeFile, lstat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

export const ARTIFACT_SCHEMA_VERSION = 1;

export function builderDataDir() {
  return resolve(process.env.DATA_DIR || join(process.cwd(), '.glondia-data'));
}

export function artifactRootDir() {
  return resolve(process.env.BUILDER_ARTIFACT_ROOT || join(builderDataDir(), 'builder-artifacts'));
}

export function workspaceRootDir() {
  return join(builderDataDir(), 'builder-workspaces');
}

export function artifactDirForRevision(revisionId) {
  const safe = String(revisionId || '').trim();
  if (!/^[A-Za-z0-9-]{8,64}$/.test(safe)) {
    const err = new Error('Invalid revision ID for artifact path.');
    err.code = 'ARTIFACT_PATH_INVALID';
    throw err;
  }
  const dir = resolve(artifactRootDir(), safe);
  if (!dir.startsWith(artifactRootDir() + sep)) {
    const err = new Error('Artifact path escapes the artifact root.');
    err.code = 'ARTIFACT_PATH_INVALID';
    throw err;
  }
  return dir;
}

async function listFilesRecursive(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const stats = await lstat(full);
    if (stats.isSymbolicLink()) continue; // validator already rejected these
    if (entry.isDirectory()) files.push(...await listFilesRecursive(full, base));
    else if (entry.isFile()) files.push(full.slice(base.length + 1).split(sep).join('/'));
  }
  return files.sort();
}

/** Hash every file under `dir`; returns { files: [{path,size,sha256}], checksum }. */
export async function hashDirectory(dir) {
  const relPaths = await listFilesRecursive(dir);
  const files = [];
  const aggregate = createHash('sha256');
  for (const rel of relPaths) {
    const content = await readFile(join(dir, ...rel.split('/')));
    const sha256 = createHash('sha256').update(content).digest('hex');
    files.push({ path: rel, size: content.length, sha256 });
    aggregate.update(`${rel}\n${content.length}\n${sha256}\n`);
  }
  return { files, checksum: aggregate.digest('hex') };
}

/**
 * Finalize a workspace into an immutable artifact directory.
 * Returns { artifactLocation, checksum, manifest }.
 */
export async function writeArtifact({
  workspaceDir,
  revisionId,
  projectId,
  template = {},
  planSnapshot = {},
  answerSheet = {},
  validationReport = {},
  generation = {},
}) {
  const artifactDir = artifactDirForRevision(revisionId);
  const filesDir = join(artifactDir, 'files');
  await rm(artifactDir, { recursive: true, force: true });
  await mkdir(filesDir, { recursive: true });

  const relPaths = await listFilesRecursive(workspaceDir);
  for (const rel of relPaths) {
    const target = join(filesDir, ...rel.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(workspaceDir, ...rel.split('/')), target);
  }

  const { files, checksum } = await hashDirectory(filesDir);
  const manifest = {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    projectId,
    revisionId,
    template: {
      templateId: template.templateId || null,
      templateVersion: template.templateVersion || null,
      templateSourceCommit: template.templateSourceCommit || null,
      templateManifestHash: template.templateManifestHash || null,
    },
    generation: {
      model: generation.model || null,
      mode: generation.mode || null,
      generatedAt: new Date().toISOString(),
    },
    fileCount: files.length,
    totalBytes: files.reduce((sum, f) => sum + f.size, 0),
    files,
    checksum,
  };

  await writeFile(join(artifactDir, 'artifact-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  await writeFile(join(artifactDir, 'plan-snapshot.json'), JSON.stringify(planSnapshot, null, 2), 'utf8');
  await writeFile(join(artifactDir, 'answer-sheet.json'), JSON.stringify(answerSheet, null, 2), 'utf8');
  await writeFile(join(artifactDir, 'validation-report.json'), JSON.stringify(validationReport, null, 2), 'utf8');

  return { artifactLocation: artifactDir, checksum, manifest };
}

/** Load and verify an artifact manifest; throws on checksum mismatch. */
export async function verifyArtifact(revisionId, expectedChecksum) {
  const artifactDir = artifactDirForRevision(revisionId);
  const manifestPath = join(artifactDir, 'artifact-manifest.json');
  if (!existsSync(manifestPath)) {
    const err = new Error('Revision artifact is missing.');
    err.code = 'ARTIFACT_MISSING';
    throw err;
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const { checksum } = await hashDirectory(join(artifactDir, 'files'));
  if (checksum !== manifest.checksum || (expectedChecksum && checksum !== expectedChecksum)) {
    const err = new Error('Revision artifact checksum mismatch.');
    err.code = 'ARTIFACT_CHECKSUM_MISMATCH';
    throw err;
  }
  return { artifactDir, manifest, checksum };
}
