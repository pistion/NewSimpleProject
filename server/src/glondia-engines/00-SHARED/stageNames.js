/**
 * stageNames.js
 *
 * Single source of truth for every stage name used across both engines.
 * Using constants prevents typos in error handling and log filtering.
 */

// ── Hosting Deploy Engine ────────────────────────────────────────────────────

export const STAGE = Object.freeze({

  // Engine 01 — Hosting Deploy
  ZIP_RECEIVE:          'zip_receive',
  ZIP_VALIDATE:         'zip_validate',
  ZIP_EXTRACT:          'zip_extract',
  ZIP_CLEAN:            'zip_clean',
  PROJECT_DETECT:       'project_detect',
  BUILD_SCRIPT_WRITE:   'build_script_write',
  GITHUB_VALIDATE:      'github_repo_validate',
  GITHUB_PUSH:          'github_push',
  RENDER_PAYLOAD_BUILD: 'render_payload_build',
  RENDER_SERVICE_CREATE:'render_service_create',
  RENDER_DEPLOY_TRIGGER:'render_deploy_trigger',
  RENDER_STATUS_POLL:   'render_status_poll',
  CLEANUP_LOCAL:        'cleanup_local',

  // Engine 02 — Template AI
  TEMPLATE_SELECT:      'template_select',
  TEMPLATE_FETCH:       'template_fetch',
  BRIEF_COLLECT:        'brief_collect',
  AI_REFINE:            'ai_refine',
  TEMPLATE_EDIT:        'template_edit',
  PREVIEW_BUILD:        'preview_build',
  HANDOFF_PACKAGE:      'handoff_package',
  HANDOFF_DEPLOY:       'handoff_deploy',
});
