/**
 * stageErrors.js
 *
 * Standard error factories for all stages.
 * Every error has: message, status, stage, code, expose, details.
 */

/**
 * 400 — bad input from the client.
 */
export function badRequest(message, stage, code = 'BAD_REQUEST', details = null) {
  const err = new Error(message);
  err.status  = 400;
  err.stage   = stage;
  err.code    = code;
  err.expose  = true;
  err.details = details;
  return err;
}

/**
 * 409 — configuration missing or conflicting state.
 */
export function configRequired(message, stage, details = null) {
  const err = new Error(message);
  err.status  = 409;
  err.stage   = stage;
  err.code    = 'CONFIGURATION_REQUIRED';
  err.expose  = true;
  err.details = details;
  return err;
}

/**
 * 502 — upstream (GitHub, Render, OpenAI) returned an error.
 */
export function upstreamError(message, stage, code = 'UPSTREAM_ERROR', details = null) {
  const err = new Error(message);
  err.status  = 502;
  err.stage   = stage;
  err.code    = code;
  err.expose  = true;
  err.details = details;
  return err;
}

/**
 * 500 — internal server error.
 */
export function internalError(message, stage, details = null) {
  const err = new Error(message);
  err.status  = 500;
  err.stage   = stage;
  err.code    = 'INTERNAL_ERROR';
  err.expose  = false;
  err.details = details;
  return err;
}

/**
 * Wrap any unknown error and stamp it with a stage name.
 */
export function wrapError(error, stage) {
  if (!error.stage) error.stage = stage;
  return error;
}
