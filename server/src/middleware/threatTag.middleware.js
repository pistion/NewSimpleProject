/**
 * threatTag.middleware.js
 *
 * Lightweight threat classifier attached to response finish events.
 * Three escalation levels (from planning/17):
 *
 *   tag_only   – record a lightweight counter, no dashboard alert
 *   warning    – create/increment DashboardWarning when repeated or slow
 *   high_threat – create WatchdogEvent immediately or after low threshold
 *
 * Does NOT create WatchdogEvent for every bad request — only repeated or
 * high-threat signals.
 */

import { prisma } from '../services/db.js';

// ── Tag configuration ─────────────────────────────────────────────────────────

// How many occurrences of a tag within windowMs before escalating to warning
const WARNING_THRESHOLDS = {
  'auth.failed_login':             5,   // 5 failures in window → warning
  'auth.invalid_token':            10,
  'auth.missing_token':            20,
  'admin.forbidden_attempt':       3,
  'service.access_denied':         5,
  'service.disabled_access_attempt': 3,
  'billing.checkout_spam':         5,
  'analytics.event_spam':          15,
  'support.ticket_spam':           5,
  'api.route_not_found':           30,
  'api.slow_request':              5,
  'provider.invalid_token':        3,
  'billing.webhook_invalid_signature': 2,
};

const WATCHDOG_THRESHOLDS = {
  'auth.bruteforce_suspected':     1,   // immediate
  'admin.forbidden_attempt':       5,
  'billing.webhook_invalid_signature': 3,
  'service.disabled_access_attempt': 5,
  'provider.invalid_token':        5,
};

const WINDOW_MS = 15 * 60 * 1000; // 15-minute window for threshold counters

// In-process counters: Map<tag:ip, [timestamp, ...]>
const counters = new Map();

function countHits(tag, ip) {
  const key = `${tag}:${ip}`;
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const hits = (counters.get(key) || []).filter(t => t > cutoff);
  hits.push(now);
  counters.set(key, hits);
  return hits.length;
}

// Sweep stale entries every 10 min
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS * 2;
  for (const [key, hits] of counters.entries()) {
    if (hits[hits.length - 1] < cutoff) counters.delete(key);
  }
}, 10 * 60 * 1000).unref?.();

// ── Warning / Watchdog helpers ────────────────────────────────────────────────

async function upsertWarning(tag, req, extra = {}) {
  try {
    const existing = await prisma.dashboardWarning.findFirst({
      where: { warningType: tag, status: 'open' },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      await prisma.dashboardWarning.update({
        where: { id: existing.id },
        data: {
          count:      { increment: 1 },
          lastSeenAt: new Date(),
          ...(extra.durationMs && {
            peakDurationMs: Math.max(existing.peakDurationMs || 0, extra.durationMs),
          }),
        },
      });
    } else {
      await prisma.dashboardWarning.create({
        data: {
          warningType:     tag,
          affectedRoute:   req.path || null,
          affectedService: extra.service || null,
          severity:        extra.severity || 'low',
          count:           1,
          avgDurationMs:   extra.durationMs || null,
          peakDurationMs:  extra.durationMs || null,
          message:         extra.message || `Repeated: ${tag}`,
        },
      });
    }
  } catch (_err) {
    // Never crash the request from monitoring code
  }
}

async function createWatchdogEvent(tag, req, severity = 'warning') {
  try {
    await prisma.watchdogEvent.create({
      data: {
        userId:      req.user?.id || null,
        eventType:   tag,
        severity,
        message:     `Threat signal: ${tag} from ${req.securityContext?.ip || req.ip}`,
        metadata:    JSON.stringify({
          ip:     req.securityContext?.ip || req.ip,
          path:   req.path,
          method: req.method,
          group:  req.securityContext?.group,
        }),
      },
    });
  } catch (_err) {
    // Never crash the request from monitoring code
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

export function threatTag(req, res, next) {
  res.on('finish', async () => {
    const ctx = req.securityContext;
    if (!ctx) return;

    const ip = ctx.ip || req.ip || 'unknown';

    // Auto-tag based on response status code.
    // 403s are NOT all admin.forbidden_attempt — distinguish by group.
    // service.access_denied is for normal suspended/expired/billing blocks.
    // admin.forbidden_attempt is reserved for requests reaching admin routes without permission.
    if (res.statusCode === 401) ctx.watchdogTags.push('auth.missing_token');
    if (res.statusCode === 403) {
      if (ctx.group === 'admin_read' || ctx.group === 'admin_write') {
        ctx.watchdogTags.push('admin.forbidden_attempt');
      } else if (!ctx.watchdogTags.includes('service.access_denied') && !ctx.watchdogTags.includes('service.disabled_access_attempt') && !ctx.watchdogTags.includes('service.owner_mismatch')) {
        // Generic 403 not already tagged by serviceAccess middleware
        ctx.watchdogTags.push('service.access_denied');
      }
    }
    if (res.statusCode === 404 && ctx.group !== 'public_read') ctx.watchdogTags.push('api.route_not_found');

    // Process each tag
    for (const tag of ctx.watchdogTags) {
      const hits = countHits(tag, ip);

      // Check watchdog threshold
      const wdThreshold = WATCHDOG_THRESHOLDS[tag];
      if (wdThreshold && hits >= wdThreshold) {
        await createWatchdogEvent(tag, req, hits > wdThreshold * 2 ? 'danger' : 'warning');
        continue;
      }

      // Check warning threshold
      const warnThreshold = WARNING_THRESHOLDS[tag];
      if (warnThreshold && hits >= warnThreshold) {
        await upsertWarning(tag, req, { severity: hits > warnThreshold * 3 ? 'medium' : 'low' });
      }
      // Below threshold: tag_only (counter already recorded in countHits)
    }
  });

  next();
}
