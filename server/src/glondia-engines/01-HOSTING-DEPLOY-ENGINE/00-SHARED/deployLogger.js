/**
 * deployLogger.js - tiny engine-local logging helper.
 */
export function logDeployRoute(message, detail = null) {
  if (detail) console.log(`[hosting-deploy] ${message}`, detail);
  else console.log(`[hosting-deploy] ${message}`);
}
