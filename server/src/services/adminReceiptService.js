/**
 * adminReceiptService.js — safe admin preview/download of uploaded files.
 *
 * Two file classes live on the persistent SSD:
 *   - payment receipts   → DATA_DIR/receipts/...
 *   - user ID photos      → DATA_DIR/user-id-photos/{userId}/...
 *
 * The frontend never sees a raw SSD path. Every download looks the record up by
 * ID, resolves the absolute path, asserts it is INSIDE the allowed root, checks
 * the extension against an allowlist, derives the Content-Type from that
 * extension (never from the untrusted stored mime), then streams the file. Any
 * path that escapes the root or carries a disallowed extension is rejected.
 */
import { resolve, join, sep, extname, basename } from 'node:path';
import { existsSync, createReadStream, statSync } from 'node:fs';
import { prisma } from './db.js';
import { writeAuditLog } from './auditLogService.js';

const dataDir = resolve(process.env.DATA_DIR || join(process.cwd(), '.glondia-data'));
export const RECEIPTS_ROOT = resolve(join(dataDir, 'receipts'));
export const ID_PHOTOS_ROOT = resolve(join(dataDir, 'user-id-photos'));

// Extension → canonical, allowed Content-Type. This map is the single source of
// truth for what may be served; an extension absent here is rejected.
const RECEIPT_EXT_MIME = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};
const ID_PHOTO_EXT_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status, expose: true });
}

/** True only when absPath is the root itself or a descendant of it. */
function isInsideRoot(absPath, root) {
  const normalized = resolve(absPath);
  return normalized === root || normalized.startsWith(root + sep);
}

/** Strip anything that could break a Content-Disposition header. */
function sanitizeFilename(name, fallback = 'file') {
  const clean = String(name || '')
    .replace(/[\r\n"\\]/g, '')
    .replace(/[/\\]/g, '_')
    .trim();
  return clean || fallback;
}

/** Safe, path-free metadata for list/detail responses. */
export function receiptView(r) {
  if (!r) return null;
  return {
    receiptId: r.id,
    fileName: r.fileName,
    fileType: r.fileType,
    fileSize: r.fileSize,
    status: r.status,
    createdAt: r.createdAt,
    checkoutOrderId: r.checkoutOrderId,
    deploymentId: r.deploymentId,
    userId: r.userId,
  };
}

export async function getReceiptMeta(receiptId) {
  const r = await prisma.paymentReceipt.findUnique({ where: { id: receiptId } });
  if (!r) throw httpError('Receipt not found.', 404);
  return receiptView(r);
}

/**
 * Look the receipt up by ID and validate the on-disk file before any streaming:
 * DB record present → path inside RECEIPTS_ROOT → allowed extension → file exists.
 */
async function resolveReceiptFile(receiptId) {
  const receipt = await prisma.paymentReceipt.findUnique({ where: { id: receiptId } });
  if (!receipt) throw httpError('Receipt not found.', 404);
  if (!receipt.filePath) throw httpError('Receipt has no stored file.', 404);

  const absPath = resolve(receipt.filePath);
  if (!isInsideRoot(absPath, RECEIPTS_ROOT)) {
    throw httpError('Receipt file path is outside the permitted directory.', 403);
  }
  const ext = extname(absPath).toLowerCase();
  const mime = RECEIPT_EXT_MIME[ext];
  if (!mime) throw httpError('Receipt file type is not permitted.', 400);
  if (!existsSync(absPath)) throw httpError('Receipt file no longer exists on disk.', 404);

  return { receipt, absPath, ext, mime, fileName: sanitizeFilename(receipt.fileName, `receipt${ext}`) };
}

/**
 * Stream a receipt to the response with the right Content-Type/Disposition.
 * disposition: 'inline' (preview) or 'attachment' (download).
 */
export async function streamReceipt({ receiptId, disposition = 'inline', res, adminUserId }) {
  const { receipt, absPath, mime, fileName } = await resolveReceiptFile(receiptId);
  const stat = statSync(absPath);

  await writeAuditLog({
    actorUserId: adminUserId,
    action: disposition === 'attachment' ? 'admin.receipt.downloaded' : 'admin.receipt.viewed',
    entityType: 'payment_receipt',
    entityId: receipt.id,
    result: { fileName, disposition, fileSize: stat.size },
  });

  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);
  createReadStream(absPath).pipe(res);
}

/** Validate + stream a user's ID photo (inline preview only). */
export async function streamUserIdPhoto({ userId, res, adminUserId }) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, idPhotoPath: true } });
  if (!user) throw httpError('User not found.', 404);
  if (!user.idPhotoPath) throw httpError('No ID photo on file.', 404);

  const absPath = resolve(user.idPhotoPath);
  if (!isInsideRoot(absPath, ID_PHOTOS_ROOT)) {
    throw httpError('ID photo path is outside the permitted directory.', 403);
  }
  const ext = extname(absPath).toLowerCase();
  const mime = ID_PHOTO_EXT_MIME[ext];
  if (!mime) throw httpError('ID photo file type is not permitted.', 400);
  if (!existsSync(absPath)) throw httpError('ID photo no longer exists on disk.', 404);

  const stat = statSync(absPath);
  await writeAuditLog({
    actorUserId: adminUserId,
    action: 'admin.user.id_photo_viewed',
    entityType: 'user',
    entityId: user.id,
    result: { fileSize: stat.size },
  });

  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename="${sanitizeFilename(basename(absPath))}"`);
  createReadStream(absPath).pipe(res);
}

export default {
  RECEIPTS_ROOT,
  ID_PHOTOS_ROOT,
  receiptView,
  getReceiptMeta,
  streamReceipt,
  streamUserIdPhoto,
};
