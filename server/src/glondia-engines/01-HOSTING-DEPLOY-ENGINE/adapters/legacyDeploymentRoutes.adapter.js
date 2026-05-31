/**
 * legacyDeploymentRoutes.adapter.js
 *
 * Keeps the old deploymentRoutes.js working while the new
 * hostingDeploy.routes.js is being built.
 *
 * Once hostingDeploy.routes.js is complete and all callers migrated,
 * server.js will point directly to hostingDeploy.routes.js and this
 * adapter can be removed.
 */

export { default } from '../routes/hostingDeploy.routes.js';
