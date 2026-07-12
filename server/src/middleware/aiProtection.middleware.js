/**
 * aiProtection.middleware.js — abuse controls for AI-spending endpoints.
 *
 * SiteBuilder hardening plan, Phase 1. Every AI call chain is:
 *   requestId → auth → account status → feature flag → rate limit
 *   → concurrency limit → input length validation → audit → AI call
 *
 * Limits are configurable:
 *   AI_MAX_PROMPT_CHARS      (default 4000)  combined text-field budget
 *   AI_MAX_CONCURRENT_JOBS   (default 2)     in-flight AI calls per user
 *
 * The concurrency guard is in-process (single-node deployment); the durable
 * per-user daily/monthly token quota lands with the Phase 4 job worker and
 * AiUsageEvent model.
 */

import { writeAuditLog } from '../services/auditLogService.js';
import { prisma } from '../services/db.js';

const MAX_PROMPT_CHARS = Number(process.env.AI_MAX_PROMPT_CHARS || 4000);
const MAX_CONCURRENT = Math.max(1, Number(process.env.AI_MAX_CONCURRENT_JOBS || 2));
const DAILY_REQUEST_LIMIT = Number(process.env.AI_DAILY_REQUEST_LIMIT || 100);
const MONTHLY_REQUEST_LIMIT = Number(process.env.AI_MONTHLY_REQUEST_LIMIT || 1000);

/** Total characters across every string found in the given value (depth-limited). */
function textSize(value, depth = 0) {
  if (value == null || depth > 4) return 0;
  if (typeof value === 'string') return value.length;
  if (typeof value !== 'object') return 0;
  let total = 0;
  for (const v of Array.isArray(value) ? value : Object.values(value)) {
    total += textSize(v, depth + 1);
    if (total > MAX_PROMPT_CHARS * 4) break; // stop counting far past the limit
  }
  return total;
}

/**
 * Reject requests whose combined prompt-relevant text exceeds the budget.
 * @param {string[]} fields body fields that feed the prompt (default: whole body)
 */
export function limitPromptChars(fields = null) {
  return function promptLimitMiddleware(req, res, next) {
    const source = fields
      ? Object.fromEntries(fields.map((f) => [f, req.body?.[f]]))
      : req.body;
    if (textSize(source) > MAX_PROMPT_CHARS) {
      return res.status(400).json({
        error: {
          code: 'AI_PROMPT_TOO_LARGE',
          message: `Request text exceeds the ${MAX_PROMPT_CHARS}-character limit.`,
        },
        requestId: req.id,
      });
    }
    next();
  };
}

// userId → number of in-flight AI requests.
const inflight = new Map();

/**
 * Per-user concurrent AI call limiter. Requires auth middleware to have run.
 * Releases on response finish/close so failures never leak slots.
 */
export function aiConcurrencyLimit(req, res, next) {
  const key = req.user?.id || req.ip || 'anonymous';
  const current = inflight.get(key) || 0;
  if (current >= MAX_CONCURRENT) {
    return res.status(429).json({
      error: {
        code: 'AI_TOO_MANY_CONCURRENT',
        message: 'Another AI request is still running. Please wait for it to finish.',
      },
      requestId: req.id,
    });
  }
  inflight.set(key, current + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const now = inflight.get(key) || 1;
    if (now <= 1) inflight.delete(key);
    else inflight.set(key, now - 1);
  };
  res.on('finish', release);
  res.on('close', release);
  next();
}

/**
 * Audit every AI call with its outcome (fires after the response completes).
 * Never blocks or throws into the request path.
 */
export function auditAiCall(operation) {
  return function aiAuditMiddleware(req, res, next) {
    const startedAt = Date.now();
    res.on('finish', () => {
      writeAuditLog({
        requestId: req.id,
        actorUserId: req.user?.id || null,
        action: `ai.${operation}`,
        entityType: 'ai_call',
        entityId: req.params?.siteId || req.params?.planId || null,
        status: res.statusCode < 400 ? 'success' : 'failed',
        method: req.method,
        path: req.originalUrl?.split('?')[0],
        result: { statusCode: res.statusCode, durationMs: Date.now() - startedAt },
      }).catch(() => {});
    });
    next();
  };
}

/**
 * Durable request-count quotas for AI-spending operations. Token/cost-level
 * accounting can be filled in by provider adapters when usage payloads exist;
 * this guard still prevents unbounded daily/monthly AI calls per account.
 */
export async function aiQuotaLimit(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId || userId === 'local-user') return next();
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [dailyRows, monthlyRows] = await Promise.all([
      prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS "count" FROM "ai_usage_events"
         WHERE "user_id" = ? AND "created_at" >= ? AND "status" IN ('success', 'failed')`,
        userId, dayStart,
      ),
      prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS "count" FROM "ai_usage_events"
         WHERE "user_id" = ? AND "created_at" >= ? AND "status" IN ('success', 'failed')`,
        userId, monthStart,
      ),
    ]);
    const daily = Number(dailyRows?.[0]?.count || 0);
    const monthly = Number(monthlyRows?.[0]?.count || 0);
    if (daily >= DAILY_REQUEST_LIMIT || monthly >= MONTHLY_REQUEST_LIMIT) {
      return res.status(429).json({
        error: {
          code: daily >= DAILY_REQUEST_LIMIT ? 'AI_DAILY_QUOTA_EXCEEDED' : 'AI_MONTHLY_QUOTA_EXCEEDED',
          message: 'AI quota reached for this account.',
        },
        requestId: req.id,
      });
    }
    next();
  } catch (err) {
    console.error('[ai:quota] quota check failed:', err.message);
    return res.status(503).json({
      error: { code: 'AI_QUOTA_UNAVAILABLE', message: 'AI quota checks are temporarily unavailable.' },
      requestId: req.id,
    });
  }
}

/**
 * Persist an AI usage row after the response completes. Provider adapters can
 * attach req.aiUsage = { provider, model, promptTokens, completionTokens,
 * estimatedCostMicros, projectId, jobId, metadata } before responding.
 */
export function recordAiUsage(operation) {
  return function aiUsageMiddleware(req, res, next) {
    res.on('finish', () => {
      const usage = req.aiUsage || {};
      prisma.$executeRawUnsafe(
        `INSERT INTO "ai_usage_events" (
          "id", "user_id", "project_id", "job_id", "provider", "model", "operation",
          "prompt_tokens", "completion_tokens", "estimated_cost_micros", "status",
          "request_id", "metadata", "created_at")
         VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        req.user?.id || null,
        usage.projectId || req.params?.projectId || req.params?.planId || null,
        usage.jobId || null,
        usage.provider || 'openai',
        usage.model || process.env.OPENAI_MODEL || 'unknown',
        operation,
        Number(usage.promptTokens || 0),
        Number(usage.completionTokens || 0),
        Number(usage.estimatedCostMicros || 0),
        res.statusCode < 400 ? 'success' : 'failed',
        req.id || null,
        JSON.stringify({ schemaVersion: 1, data: usage.metadata || {} }),
      ).catch((err) => console.error('[ai:usage] failed to record usage:', err.message));
    });
    next();
  };
}
