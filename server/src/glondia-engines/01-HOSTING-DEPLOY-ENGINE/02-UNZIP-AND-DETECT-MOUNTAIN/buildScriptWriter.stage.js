/**
 * buildScriptWriter.stage.js - 02-UNZIP-AND-DETECT-MOUNTAIN
 *
 * Writes the Render build script used for extracted ZIP/generator sources.
 * The old service file re-exports these functions for compatibility.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { stageFail, stageStart, stageSuccess } from '../../00-SHARED/stageLogger.js';

export async function runStage(context) {
  const stageName = 'build_script_write';
  stageStart(context, stageName, context.source?.localDir || null);
  try {
    const shell = await writeRenderBuildScript(context.source.localDir, context.project || {});
    context.project.buildCommand = shell.buildCommand;
    context.source.buildScript = shell;
    stageSuccess(context, stageName, shell.relativePath);
    return context;
  } catch (error) {
    stageFail(context, stageName, error);
    throw error;
  }
}

export async function writeRenderBuildScript(siteDir, detected = {}) {
  const scriptPath = path.join(siteDir, 'glondia-render-build.sh');
  const publishDirectory = detected.publishDirectory || detected.detectedPublishDirectory || 'dist';
  const buildCommand = detected.detectedBuildCommand || null;
  const nodeVersion = detected.nodeVersion || null;
  // A web service with no build command still needs its dependencies installed,
  // but must NOT run a second install/build step — that double-installs.
  const isServerSource = detected.serviceType === 'web_service' || detected.detectedServiceType === 'web_service';

  let body;
  if (buildCommand) {
    body = sourceBuildScript({ buildCommand, publishDirectory, framework: detected.framework, nodeVersion });
  } else if (isServerSource) {
    body = installOnlyBuildScript({ framework: detected.framework, nodeVersion });
  } else {
    body = staticBuildScript({ publishDirectory });
  }

  await fs.writeFile(scriptPath, body, { mode: 0o755 });
  return { scriptPath, relativePath: 'glondia-render-build.sh', buildCommand: 'bash glondia-render-build.sh' };
}

/**
 * Write the root-level build dispatcher. It runs when Render has no rootDir set
 * on the service and locates the correct site directory via env vars.
 *
 * The published site files may live under any configured generated-sites root
 * (e.g. `generated-sites/<slug>` or `uploaded-sites/<slug>`), so the dispatcher
 * must use the SAME root base that the publisher used for targetRoot. Pass it
 * via options.rootBase; it also honours GLONDIA_SITE_ROOT_DIR at runtime so a
 * misconfigured service can be corrected without re-publishing.
 *
 * @param {string} repoRootDir  Local dir where the dispatcher script is written.
 * @param {{ rootBase?: string }} [options]
 */
export async function writeRootDispatcherScript(repoRootDir, options = {}) {
  const scriptPath = path.join(repoRootDir, 'glondia-render-build.sh');
  const rootBase = options.rootBase
    || process.env.RENDER_GENERATED_SITES_ROOT_DIR
    || process.env.GLONDIA_SITE_ROOT_DIR
    || 'uploaded-sites';
  const safeRootBase = String(rootBase).replace(/^\/+/, '').replace(/\\/g, '/').replace(/\/+$/g, '') || 'uploaded-sites';
  const body = `#!/usr/bin/env bash
set -euo pipefail

# Root-level dispatcher - runs when Render has no rootDir set on the service.
# Finds the correct site directory via the GLONDIA_SITE_ROOT_DIR (base) and
# GLONDIA_SITE_SLUG (folder) env vars. The base defaults to the root used when
# the site source was published.

SITE_ROOT_DIR="\${GLONDIA_SITE_ROOT_DIR:-${safeRootBase}}"
SITE_SLUG="\${GLONDIA_SITE_SLUG:-}"
if [ -z "$SITE_SLUG" ]; then
  echo "[glondia] ERROR: GLONDIA_SITE_SLUG is not set and no rootDir was configured."
  echo "[glondia] GLONDIA_SITE_ROOT_DIR=$SITE_ROOT_DIR"
  echo "[glondia] Set GLONDIA_SITE_SLUG on the Render service to the site folder name."
  exit 1
fi

SITE_DIR="$SITE_ROOT_DIR/$SITE_SLUG"
if [ ! -d "$SITE_DIR" ]; then
  echo "[glondia] ERROR: Site directory not found: $SITE_DIR"
  echo "[glondia] GLONDIA_SITE_ROOT_DIR=$SITE_ROOT_DIR GLONDIA_SITE_SLUG=$SITE_SLUG"
  exit 1
fi

echo "[glondia] Dispatching build for site: $SITE_SLUG (root: $SITE_ROOT_DIR)"
cd "$SITE_DIR"
bash glondia-render-build.sh
`;
  await fs.writeFile(scriptPath, body, { mode: 0o755 });
  return scriptPath;
}

function staticBuildScript({ publishDirectory }) {
  return `#!/usr/bin/env bash
set -euo pipefail
echo "[glondia] Static/prebuilt site detected. Preparing publish directory: ${publishDirectory}"
if [ "${publishDirectory}" = "." ]; then
  echo "[glondia] Publishing repository root."
elif [ -d "${publishDirectory}" ]; then
  echo "[glondia] Publish directory exists: ${publishDirectory}"
elif [ -f index.html ]; then
  rm -rf dist
  mkdir -p dist
  shopt -s dotglob
  for item in *; do
    if [ "$item" != "dist" ] && [ "$item" != "glondia-render-build.sh" ]; then
      cp -R "$item" dist/
    fi
  done
else
  echo "[glondia] ERROR: publish directory not found and no index.html fallback exists."
  exit 1
fi
`;
}

// Package lifecycle scripts (preinstall/install/postinstall/prepare) never
// run for customer source: installs use --ignore-scripts. Only the explicit,
// server-approved build command executes.
function installOnlyBuildScript({ framework, nodeVersion }) {
  return `#!/usr/bin/env bash
set -euo pipefail
echo "[glondia] Installing dependencies for ${framework || 'Node.js server'} (no build step, lifecycle scripts disabled)"
${nodeVersion ? `echo "[glondia] Requested Node version: ${nodeVersion}"\n` : ''}if [ -f package-lock.json ]; then
  npm ci --ignore-scripts
else
  npm install --ignore-scripts
fi
echo "[glondia] No build command detected; dependencies installed only."
`;
}

function sourceBuildScript({ buildCommand, publishDirectory, framework, nodeVersion }) {
  return `#!/usr/bin/env bash
set -euo pipefail
echo "[glondia] Installing and building ${framework || 'project'} (lifecycle scripts disabled)"
${nodeVersion ? `echo "[glondia] Requested Node version: ${nodeVersion}"\n` : ''}if [ -f package-lock.json ]; then
  npm ci --ignore-scripts
else
  npm install --ignore-scripts
fi
${buildCommand}
if [ ! -d "${publishDirectory}" ] && [ -f index.html ]; then
  echo "[glondia] Build output ${publishDirectory} missing. Preparing dist fallback."
  rm -rf dist
  mkdir -p dist
  shopt -s dotglob
  for item in *; do
    if [ "$item" != "dist" ] && [ "$item" != "glondia-render-build.sh" ]; then
      cp -R "$item" dist/
    fi
  done
fi
echo "[glondia] Build script complete"
`;
}
