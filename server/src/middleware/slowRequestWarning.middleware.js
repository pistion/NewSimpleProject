/**
 * slowRequestWarning.middleware.js
 *
 * Tracks request duration and escalates slow requests to DashboardWarning.
 * Thresholds from planning/17:
 *   api_slow_warning:   > 1500ms
 *   api_very_slow:      > 5000ms  → WatchdogEvent after repeated occurrences
 *   admin_slow_warning: > 2000ms for admin APIs
 *
 * Call startSlowRequestTimer() BEFORE routes, finish() fires on response.
 */

import { prisma } from '../services/db.js';

const THRESHOLDS = {
  api:    { warning: 1500, very_slow: 5000 },
  admin:  { warning: 2000, very_slow: 8000 },
};

// Simple in-process counter for very-slow escalation
const verySlowCounters = new Map();

function incrementVerySlow(route) {
  const count = (verySlowCounters.get(route) || 0) + 1;
  verySlowCounters.set(route, count);
  return count;
}

// Reset counters hourly
setInterval(() => verySlowCounters.clear(), 60 * 60 * 1000).unref?.();

export function slowRequestWarning(req, res, next) {
  const startMs = Date.now();

  res.on('finish', async () => {
    const durationMs = Date.now() - startMs;
    const isAdmin = req.path?.startsWith('/api/admin');
    const thresholds = isAdmin ? THRESHOLDS.admin : THRESHOLDS.api;

    if (durationMs < thresholds.warning) return;

    if (req.securityContext) {
      req.securityContext.watchdogTags.push('api.slow_request');
    }

    const route = `${req.method} ${req.path?.split('?')[0] || '/'}`.slice(0, 120);

    try {
      // Upsert warning record
      const existing = await prisma.dashboardWarning.findFirst({
        where: { warningType: 'slow_requests', affectedRoute: route, status: 'open' },
      });

      if (existing) {
        await prisma.dashboardWarning.update({
          where: { id: existing.id },
          data: {
            count:         { increment: 1 },
            lastSeenAt:    new Date(),
            peakDurationMs: Math.max(existing.peakDurationMs || 0, durationMs),
            avgDurationMs:  Math.round(((existing.avgDurationMs || durationMs) + durationMs) / 2),
          },
        });
      } else {
        await prisma.dashboardWarning.create({
          data: {
            warningType:    'slow_requests',
            affectedRoute:  route,
            severity:       durationMs >= thresholds.very_slow ? 'high' : 'medium',
            count:          1,
            avgDurationMs:  durationMs,
            peakDurationMs: durationMs,
            message:        `Slow request detected: ${durationMs}ms on ${route}`,
          },
        });
      }

      // Very slow → escalate to WatchdogEvent after 3 occurrences
      if (durationMs >= thresholds.very_slow) {
        const verySlowCount = incrementVerySlow(route);
        if (verySlowCount >= 3) {
          await prisma.watchdogEvent.create({
            data: {
              eventType: 'api.very_slow_request',
              severity:  'warning',
              message:   `Very slow request (${durationMs}ms) on ${route} — repeated ${verySlowCount}×`,
              metadata:  JSON.stringify({ route, durationMs, count: verySlowCount }),
            },
          });
        }
      }
    } catch (_err) {
      // Never crash from monitoring code
    }
  });

  next();
}
