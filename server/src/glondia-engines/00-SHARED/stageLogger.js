/**
 * stageLogger.js
 *
 * Consistent logging for every stage in both engines.
 * Each stage calls start(), success(), or fail() — nothing else.
 *
 * Writes to context.logs[] AND console so both the hosting store
 * and the server output show what happened.
 */

import { makeId, nowIso } from '../../services/hostingStore.js';

function makeLogEntry(level, message, details = null) {
  return {
    id:        makeId('log'),
    level,
    message,
    details:   details || undefined,
    timestamp: nowIso(),
    createdAt: nowIso(),
    source:    'glondia-engine',
  };
}

/**
 * Call at the very start of a stage.
 */
export function stageStart(context, stageName, detail = null) {
  context.currentStage = stageName;
  const msg = `[${stageName}] started${detail ? ': ' + detail : ''}`;
  context.logs.push(makeLogEntry('info', msg));
  console.log(`[stage] ${msg}`);
}

/**
 * Call when the stage completed successfully.
 */
export function stageSuccess(context, stageName, summary = null) {
  const msg = `[${stageName}] done${summary ? ': ' + summary : ''}`;
  context.logs.push(makeLogEntry('ok', msg));
  console.log(`[stage] ${msg}`);
}

/**
 * Call when the stage fails.
 */
export function stageFail(context, stageName, error) {
  const msg = `[${stageName}] failed: ${error?.message || String(error)}`;
  context.logs.push(makeLogEntry('error', msg, error?.details || null));
  console.error(`[stage] ${msg}`);
}

/**
 * Convenience: write an info log without a stage transition.
 */
export function stageInfo(context, message, details = null) {
  context.logs.push(makeLogEntry('info', message, details));
}

/**
 * Convenience: write a warning log.
 */
export function stageWarn(context, message, details = null) {
  context.logs.push(makeLogEntry('warn', message, details));
  console.warn(`[stage] ${message}`);
}
