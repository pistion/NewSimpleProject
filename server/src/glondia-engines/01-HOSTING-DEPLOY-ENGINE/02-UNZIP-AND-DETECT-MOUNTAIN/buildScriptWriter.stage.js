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

  const body = buildCommand
    ? sourceBuildScript({ buildCommand, publishDirectory, framework: detected.framework, nodeVersion })
    : staticBuildScript({ publishDirectory });

  await fs.writeFile(scriptPath, body, { mode: 0o755 });
  return { scriptPath, relativePath: 'glondia-render-build.sh', buildCommand: 'bash glondia-render-build.sh' };
}

export async function writeRootDispatcherScript(repoRootDir) {
  const scriptPath = path.join(repoRootDir, 'glondia-render-build.sh');
  const body = `#!/usr/bin/env bash
set -euo pipefail

# Root-level dispatcher - runs when Render has no rootDir set on the service.
# Finds the correct site directory via GLONDIA_SITE_SLUG env var.

SITE_SLUG="\${GLONDIA_SITE_SLUG:-}"
if [ -z "$SITE_SLUG" ]; then
  echo "[glondia] ERROR: GLONDIA_SITE_SLUG is not set and no rootDir was configured."
  echo "[glondia] Set GLONDIA_SITE_SLUG on the Render service to the site folder name."
  exit 1
fi

SITE_DIR="uploaded-sites/$SITE_SLUG"
if [ ! -d "$SITE_DIR" ]; then
  echo "[glondia] ERROR: Site directory not found: $SITE_DIR"
  exit 1
fi

echo "[glondia] Dispatching build for site: $SITE_SLUG"
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

function sourceBuildScript({ buildCommand, publishDirectory, framework, nodeVersion }) {
  return `#!/usr/bin/env bash
set -euo pipefail
echo "[glondia] Installing and building ${framework || 'project'}"
${nodeVersion ? `echo "[glondia] Requested Node version: ${nodeVersion}"\n` : ''}if [ -f package-lock.json ]; then
  npm ci
else
  npm install
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
