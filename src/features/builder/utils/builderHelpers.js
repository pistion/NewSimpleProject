// src/features/builder/utils/builderHelpers.js — shared utilities for the site builder feature

/**
 * Clamp a number between min and max.
 */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Slugify a string for use in URLs / site names.
 */
export function slugify(str = '') {
  return str
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Return a display label for a service type key.
 */
export function serviceTypeLabel(serviceType) {
  return { static_site: 'Static site', web_service: 'Web service' }[serviceType] ?? serviceType;
}

/**
 * Wait at least `minimumMs` from `startedAt` before resolving.
 * Useful for showing loaders long enough for UX clarity.
 */
export function waitForMinimumTime(startedAt, minimumMs = 1200) {
  const remaining = minimumMs - (Date.now() - startedAt);
  return remaining > 0
    ? new Promise((resolve) => setTimeout(resolve, remaining))
    : Promise.resolve();
}
