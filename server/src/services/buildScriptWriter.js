import fs from 'node:fs/promises';
import path from 'node:path';

export async function writeRenderBuildScript(siteDir, detected = {}) {
  const scriptPath = path.join(siteDir, 'glondia-render-build.sh');
  const publishDirectory = detected.publishDirectory || detected.detectedPublishDirectory || 'dist';
  const buildCommand = detected.detectedBuildCommand || null;
  const nodeVersion = detected.nodeVersion || null;

  const body = buildCommand ? sourceBuildScript({ buildCommand, publishDirectory, framework: detected.framework, nodeVersion }) : staticBuildScript({ publishDirectory });
  await fs.writeFile(scriptPath, body, { mode: 0o755 });
  return { scriptPath, relativePath: 'glondia-render-build.sh', buildCommand: 'bash glondia-render-build.sh' };
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
