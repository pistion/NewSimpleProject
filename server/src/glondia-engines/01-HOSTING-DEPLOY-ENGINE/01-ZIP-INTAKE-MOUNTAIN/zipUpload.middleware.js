/**
 * zipUpload.middleware.js - ZIP upload middleware only.
 *
 * Uploads stream to a DISK QUARANTINE directory
 * (DATA_DIR/quarantine/uploads) under a server-generated filename — never
 * into process memory and never under a customer-controlled name. The
 * quarantined file is removed when the response finishes; downstream stages
 * read it via file.path.
 */
import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import multer from 'multer';

function quarantineDir() {
  const dataDir = resolve(process.env.DATA_DIR || join(process.cwd(), '.glondia-data'));
  const dir = join(dataDir, 'quarantine', 'uploads');
  mkdirSync(dir, { recursive: true });
  return dir;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      try { cb(null, quarantineDir()); } catch (err) { cb(err); }
    },
    filename: (_req, _file, cb) => cb(null, `upload-${randomUUID()}.zip`),
  }),
  limits: {
    fileSize: Number(process.env.ZIP_MAX_COMPRESSED_BYTES || process.env.ZIP_UPLOAD_MAX_BYTES || process.env.MAX_ZIP_BYTES || 100 * 1024 * 1024),
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!/\.zip$/i.test(file.originalname || '')) {
      const error = new Error('Only .zip uploads are supported.');
      error.status = 400;
      error.code = 'ZIP_INVALID_TYPE';
      error.stage = 'zip_upload';
      error.expose = true;
      cb(error);
      return;
    }
    cb(null, true);
  },
});

const zipUploadFields = upload.fields([
  { name: 'zip', maxCount: 1 },
  { name: 'file', maxCount: 1 },
  { name: 'siteZip', maxCount: 1 },
]);

function collectUploadedPaths(req) {
  const paths = [];
  for (const list of Object.values(req.files || {})) {
    for (const file of list || []) {
      if (file?.path) paths.push(file.path);
    }
  }
  if (req.file?.path) paths.push(req.file.path);
  return paths;
}

export function zipUploadMiddleware(req, res, next) {
  zipUploadFields(req, res, (error) => {
    // Quarantined uploads never outlive the request that carried them.
    res.on('close', () => {
      for (const filePath of collectUploadedPaths(req)) {
        rm(filePath, { force: true }).catch(() => {});
      }
    });
    if (!error) return next();
    next(normalizeZipUploadError(error));
  });
}

function normalizeZipUploadError(error) {
  if (error instanceof multer.MulterError) {
    const normalized = new Error(multerMessage(error));
    normalized.status = 400;
    normalized.code = multerCode(error);
    normalized.stage = 'zip_upload';
    normalized.expose = true;
    normalized.details = { field: error.field || null, limit: error.limit || null };
    return normalized;
  }

  error.status = error.status || 400;
  error.code = error.code || 'ZIP_UPLOAD_ERROR';
  error.stage = error.stage || 'zip_upload';
  error.expose = true;
  return error;
}

function multerCode(error) {
  return {
    LIMIT_FILE_SIZE: 'ZIP_FILE_TOO_LARGE',
    LIMIT_FILE_COUNT: 'ZIP_TOO_MANY_FILES',
    LIMIT_UNEXPECTED_FILE: 'ZIP_UNEXPECTED_FIELD',
    LIMIT_PART_COUNT: 'ZIP_TOO_MANY_PARTS',
  }[error.code] || 'ZIP_UPLOAD_ERROR';
}

function multerMessage(error) {
  return {
    LIMIT_FILE_SIZE: 'ZIP file is too large. Compress a smaller site or remove build/cache folders and try again.',
    LIMIT_FILE_COUNT: 'Upload one ZIP file only.',
    LIMIT_UNEXPECTED_FILE: 'Use field name zip, file, or siteZip for the ZIP upload.',
    LIMIT_PART_COUNT: 'Upload contains too many form parts. Send one ZIP file and basic deployment settings only.',
  }[error.code] || error.message || 'ZIP upload failed.';
}

export default zipUploadMiddleware;
