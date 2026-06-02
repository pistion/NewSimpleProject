/**
 * zipUpload.middleware.js - ZIP upload middleware only.
 */
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.ZIP_UPLOAD_MAX_BYTES || process.env.MAX_ZIP_BYTES || 100 * 1024 * 1024),
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!/\.zip$/i.test(file.originalname || '')) {
      const error = new Error('Only .zip uploads are supported.');
      error.status = 400;
      error.stage = 'zip_upload';
      cb(error);
      return;
    }
    cb(null, true);
  },
});

export const zipUploadMiddleware = upload.fields([
  { name: 'zip', maxCount: 1 },
  { name: 'file', maxCount: 1 },
  { name: 'siteZip', maxCount: 1 },
]);

export default zipUploadMiddleware;
