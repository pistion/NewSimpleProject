/**
 * Backward-compatibility re-export.
 * Logic has moved to: server/src/glondia-engines/00-SHARED/runtimeConfig.js
 * Do not add new logic here — use the shared version directly.
 */
export {
  isBlank,
  isPlaceholder,
  hasRealValue,
  normalizeRoot,
  getRuntimeConfig,
} from '../glondia-engines/00-SHARED/runtimeConfig.js';
