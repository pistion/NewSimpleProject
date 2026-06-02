import { prisma } from './db.js';

const SENSITIVE_KEYS = new Set([
  'password', 'passwordHash', 'token', 'accessToken', 'refreshToken',
  'apiKey', 'secret', 'authorization', 'cookie', 'paypalClientSecret',
  'renderApiKey', 'spaceshipApiSecret', 'githubToken',
]);

let auditLogTableAvailable = null;

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (SENSITIVE_KEYS.has(key) || /password|secret|token|key|authorization|cookie/i.test(key)) {
        return [key, '[REDACTED]'];
      }
      return [key, redact(item)];
    }),
  );
}

export async function writeAuditLog(input = {}, tx = prisma) {
  if (String(process.env.AUDIT_LOG_ENABLED || 'true').toLowerCase() === 'false') return null;
  if (!tx.auditLog?.create) return null;
  if (!(await auditTableExists(tx))) return null;

  const metadata = {
    requestId: input.requestId || null,
    ip: input.ip || null,
    userAgent: input.userAgent || null,
    params: redact(input.params || {}),
    query: redact(input.query || {}),
    body: redact(input.body || {}),
    result: redact(input.result || {}),
    error: input.error ? { name: input.error.name, message: input.error.message, code: input.error.code, status: input.error.status } : null,
  };

  try {
    return await tx.auditLog.create({
      data: {
        organizationId: input.organizationId || null,
        actorUserId: input.actorUserId || null,
        action: input.action || 'unknown',
        entityType: input.entityType || null,
        entityId: input.entityId || null,
        status: input.status || 'success',
        method: input.method || null,
        path: input.path || null,
        metadata: JSON.stringify(metadata),
      },
    });
  } catch (error) {
    if (error?.code === 'P2021' && String(error?.meta?.table || '').includes('audit_logs')) {
      return null;
    }
    throw error;
  }
}

async function auditTableExists(tx) {
  if (auditLogTableAvailable !== null) return auditLogTableAvailable;
  if (typeof tx.$queryRawUnsafe !== 'function') return true;
  try {
    const rows = await tx.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audit_logs' LIMIT 1");
    auditLogTableAvailable = Array.isArray(rows) ? rows.length > 0 : true;
    return auditLogTableAvailable;
  } catch {
    // Non-SQLite providers or transaction clients may not support sqlite_master.
    // Let the normal create path run and surface any real provider errors there.
    auditLogTableAvailable = true;
    return true;
  }
}
