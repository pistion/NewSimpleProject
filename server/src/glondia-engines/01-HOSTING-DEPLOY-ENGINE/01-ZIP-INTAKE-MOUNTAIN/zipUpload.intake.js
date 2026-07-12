/**
 * zipUpload.intake.js - 01-ZIP-INTAKE-MOUNTAIN
 *
 * Normalizes multipart ZIP upload input into the shared deployment context.
 */

import path from 'node:path';
import { getRuntimeConfig, normalizeRoot } from '../../00-SHARED/runtimeConfig.js';
import { renderSafeName } from '../../00-SHARED/deploymentRecordStore.js';
import { badRequest } from '../../00-SHARED/stageErrors.js';
import { stageFail, stageStart, stageSuccess } from '../../00-SHARED/stageLogger.js';

export function normalizeZipUploadInput(input = {}, context = {}) {
  const file = input.file;
  const fields = input.fields || {};
  if (!file?.buffer && !file?.path) {
    throw badRequest('A ZIP file is required. Send multipart/form-data with field name zip, file, or siteZip.', 'zip_upload', 'ZIP_FILE_REQUIRED');
  }

  const cfg = getRuntimeConfig();
  const siteName = fields.serviceName || fields.siteName || String(file.originalname || 'uploaded-site').replace(/\.zip$/i, '');
  const slug = fields.slug || renderSafeName(siteName);
  const uploadId = `zip_${Date.now()}`;
  const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), '.glondia-data'));
  const siteDir = path.resolve(dataDir, 'uploaded-sites', uploadId);
  const targetRoot = normalizeRoot(fields.rootDirectory || path.posix.join(cfg.generatedSitesRootDir, slug)) || path.posix.join('uploaded-sites', slug);
  const sourceRepo = fields.repoUrl || fields.repositoryUrl || cfg.generatedSitesRepo;
  const branch = fields.branch || cfg.githubDefaultBranch || 'main';

  return {
    file,
    fields,
    siteName,
    slug,
    uploadId,
    siteDir,
    targetRoot,
    sourceRepo,
    branch,
    userId: context.userId || input.userId || 'local-user',
  };
}

export async function runStage(context) {
  const stageName = 'zip_upload';
  stageStart(context, stageName);
  try {
    const normalized = normalizeZipUploadInput(context.input || {}, context);
    context.input = { ...context.input, ...normalized };
    context.source.localDir = normalized.siteDir;
    context.source.rootDir = normalized.targetRoot;
    context.source.repoUrl = normalized.sourceRepo;
    context.source.branch = normalized.branch;
    context.sourceType = 'zip';
    stageSuccess(context, stageName, normalized.file.originalname || 'upload.zip');
    return context;
  } catch (error) {
    stageFail(context, stageName, error);
    throw error;
  }
}
