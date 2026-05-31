/**
 * localTempCleanup.stage.js - 06-CLEANUP-MOUNTAIN
 *
 * Local cleanup helper. It is intentionally opt-in: generated GitHub source is
 * never deleted here because Render may need it for future deploys.
 */

import fs from 'node:fs/promises';

export async function cleanupLocalDir(localDir) {
  if (!localDir) return false;
  await fs.rm(localDir, { recursive: true, force: true });
  return true;
}

export async function runStage(context) {
  if (!context.cleanup?.removeLocalDir) return context;
  context.cleanup.localDirRemoved = await cleanupLocalDir(context.source?.localDir);
  context.cleanup.reason = context.cleanup.reason || 'pipeline-requested';
  return context;
}
