/**
 * renderCommon.js — 00-SHARED
 *
 * Shared Render helpers: status normalisation, URL extraction, name utils.
 * Both engines import from here — never duplicate these in stage files.
 *
 * Consolidates logic previously spread across:
 *   services/renderApiService.js
 *   services/hostingService.js
 *   services/deploymentStatusService.js
 */

// ── Status normalisation ──────────────────────────────────────────────────────

const STATUS_MAP = {
  // Building / in progress
  created:                  'building',
  queued:                   'building',
  build_in_progress:        'building',
  update_in_progress:       'building',
  pre_deploy_in_progress:   'building',

  // Live / success
  live:                     'live',
  deployed:                 'live',
  succeeded:                'live',

  // Failed
  failed:                   'failed',
  build_failed:             'failed',
  update_failed:            'failed',
  pre_deploy_failed:        'failed',
  canceled:                 'failed',

  // Suspended
  suspended:                'suspended',
};

/**
 * Convert a Render deploy/service status string to a Glondia status.
 * Returns null if the status is unknown.
 *
 * @param {string} renderStatus
 * @returns {'building'|'live'|'failed'|'suspended'|null}
 */
export function normaliseRenderStatus(renderStatus) {
  return STATUS_MAP[String(renderStatus || '').toLowerCase()] || null;
}

/**
 * Returns true if the Render status indicates the service is live.
 */
export function isLiveStatus(renderStatus) {
  return normaliseRenderStatus(renderStatus) === 'live';
}

/**
 * Returns true if the Render status indicates a build is in progress.
 */
export function isBuildingStatus(renderStatus) {
  return normaliseRenderStatus(renderStatus) === 'building';
}

// ── URL extraction ────────────────────────────────────────────────────────────

/**
 * Extract the public URL from any Render service response shape.
 */
export function extractRenderUrl(serviceResponse) {
  const svc = serviceResponse?.service || serviceResponse;
  return (
    svc?.serviceDetails?.url ||
    svc?.url ||
    null
  );
}

// ── Name helpers ──────────────────────────────────────────────────────────────

/**
 * Convert any string to a Render-safe service name.
 * lowercase, alphanumeric + hyphens only, max 60 chars.
 */
export function renderSafeName(value) {
  return String(value || 'glondia-site')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'glondia-site';
}

// ── Service type inference ────────────────────────────────────────────────────

/**
 * Infer Render service type from deploy settings.
 * Returns 'static_site' or 'web_service'.
 */
export function inferServiceType(input = {}) {
  if (input.serviceType) return input.serviceType;
  if (input.startCommand) return 'web_service';
  const fw = String(input.framework || '').toLowerCase();
  const serverFrameworks = ['express', 'node', 'node.js server', 'fastify', 'koa', 'hapi', 'nestjs', 'next.js', 'remix', 'sveltekit'];
  if (serverFrameworks.some((s) => fw.includes(s))) return 'web_service';
  return 'static_site';
}

// ── Payload cleaner ───────────────────────────────────────────────────────────

/**
 * Recursively remove empty strings, null values, and empty nested objects
 * from a payload before sending to Render.
 */
export function cleanObject(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanObject(item)).filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      const cleaned = cleanObject(child);
      if (
        cleaned !== undefined &&
        cleaned !== null &&
        !(typeof cleaned === 'object' && !Array.isArray(cleaned) && Object.keys(cleaned).length === 0)
      ) {
        output[key] = cleaned;
      }
    }
    return output;
  }
  if (value === '') return undefined;
  return value;
}

// ── Error helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true if a Render API error means the resource no longer exists.
 */
export function isRenderGone(error) {
  return error?.status === 404 || error?.status === 410;
}
