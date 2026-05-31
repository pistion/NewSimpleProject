/**
 * Backward-compatibility re-export.
 * Logic has moved to: server/src/glondia-engines/00-SHARED/deploymentRecordStore.js
 * Do not add new logic here — use the shared version directly.
 */
export {
  createDeploymentRecord,
  updateDeploymentRecord,
  addDeploymentLog,
  makeLog,
  renderSafeName,
  serviceUrl,
} from '../glondia-engines/00-SHARED/deploymentRecordStore.js';
