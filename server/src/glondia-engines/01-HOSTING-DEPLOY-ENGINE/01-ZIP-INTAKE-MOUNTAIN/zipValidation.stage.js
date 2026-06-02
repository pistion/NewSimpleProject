/**
 * zipValidation.stage.js - validate ZIP previews without creating deployments.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { extractZipSafely } from '../02-UNZIP-AND-DETECT-MOUNTAIN/zipExtractor.stage.js';
import { detectProject } from '../02-UNZIP-AND-DETECT-MOUNTAIN/projectDetector.stage.js';
import { resolveDeployMode } from '../02-UNZIP-AND-DETECT-MOUNTAIN/deployModeResolver.stage.js';

export async function validateZipDeploymentPreview({ file, fields = {} } = {}) {
  if (!file?.buffer) {
    const error = new Error('A ZIP file is required.');
    error.status = 400;
    error.code = 'ZIP_MISSING_FILE';
    error.stage = 'zip_upload';
    throw error;
  }

  const validationDir = path.join(tmpdir(), `glondia-zip-validate-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    const extracted = await extractZipSafely(file.buffer, validationDir);
    const detected = await detectProject(validationDir, extracted.files);
    const deployMode = resolveDeployMode({
      detected,
      selectedMode: fields.deployMode || fields.mode || 'auto',
      fields,
      files: extracted.files,
    });
    return {
      valid: true,
      fileName: file.originalname || null,
      fileSize: file.size || file.buffer.length,
      files: extracted.files.length,
      ignoredFiles: extracted.ignoredFiles || [],
      ignoredCount: extracted.ignoredFiles?.length || 0,
      rootPrefix: extracted.rootPrefix || '',
      detected,
      deployMode,
    };
  } finally {
    await fs.rm(validationDir, { recursive: true, force: true }).catch(() => {});
  }
}

export default { validateZipDeploymentPreview };
