/**
 * deploymentContext.js
 *
 * The shared "backpack" passed between every stage in both engines.
 * Each stage reads from context, does its job, writes its result back in,
 * and returns the same context object.
 *
 * Never pass plain input objects between stages — always use this context.
 */

import { makeId, nowIso } from '../../services/hostingStore.js';

/**
 * Create a fresh deployment context.
 * Call this once at the start of a pipeline, then pass it through every stage.
 *
 * @param {object} input  Raw input from the request (req.body, file, userId, etc.)
 * @returns {DeploymentContext}
 */
export function createDeploymentContext(input = {}) {
  return {
    // ── Identity ────────────────────────────────────────────────────────────
    deploymentId:   input.deploymentId || makeId('dep'),
    sourceType:     input.sourceType   || null,   // 'zip' | 'github' | 'template'
    currentStage:   'init',
    userId:         input.userId       || input.user_id || 'local-user',
    createdAt:      nowIso(),

    // ── Raw input passed in from the route ────────────────────────────────
    input,

    // ── Stage 01-02: Source files on disk ─────────────────────────────────
    source: {
      localDir:      null,   // absolute path to extracted files
      repoUrl:       null,   // GitHub repo URL (if github source type)
      branch:        input.branch || 'main',
      rootDir:       null,   // subdirectory within repo (targetRoot)
      files:         [],     // relative file paths after extraction
      ignoredFiles:  [],
      manifestPath:  null,
    },

    // ── Stage 02: Detected project shape ─────────────────────────────────
    project: {
      framework:        null,
      serviceType:      null,   // 'static_site' | 'web_service'
      buildCommand:     null,
      publishDirectory: null,
      startCommand:     null,
      runtime:          null,
      nodeVersion:      null,
      packageManager:   'npm',
    },

    // ── Stage 02-01 (Template AI only): Template metadata ─────────────────
    template: {
      templateId:       null,
      templateRepoUrl:  null,
      templatePath:     null,
      selectedVersion:  null,
      workDir:          null,
    },

    // ── Stage 03 (Template AI only): User answers ─────────────────────────
    brief: {},

    // ── Stage 04 (Template AI only): AI output ────────────────────────────
    ai: {
      model:         null,
      prompt:        null,
      tailoredPages: [],
      rawResponse:   null,
    },

    // ── Stage 03 (Hosting): GitHub publish result ─────────────────────────
    github: {
      targetRepo:     null,
      targetRoot:     null,
      publishedCount: 0,
      errors:         [],
    },

    // ── Stage 04-05: Render service payload + result ──────────────────────
    render: {
      payload:        null,
      serviceId:      null,
      deployId:       null,
      liveUrl:        null,
      status:         null,
      providerStatus: null,
    },

    // ── Stage 06: Cleanup tracking ────────────────────────────────────────
    cleanup: {
      localDirRemoved: false,
      reason:          null,
    },

    // ── Inline log entries (written by stageLogger) ───────────────────────
    logs: [],
  };
}

/**
 * Merge a partial result into context.
 * Use this inside stages to write results back cleanly.
 *
 * @param {DeploymentContext} context
 * @param {object} patch  Partial context shape to merge in
 * @returns {DeploymentContext}
 */
export function mergeContext(context, patch = {}) {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && typeof context[key] === 'object') {
      context[key] = { ...context[key], ...value };
    } else {
      context[key] = value;
    }
  }
  return context;
}
