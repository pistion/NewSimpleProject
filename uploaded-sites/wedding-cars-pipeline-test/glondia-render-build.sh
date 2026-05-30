#!/usr/bin/env bash
set -euo pipefail
echo "[glondia] Installing and building Vite"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
npm run build
if [ ! -d "dist" ] && [ -f index.html ]; then
  echo "[glondia] Build output dist missing. Preparing dist fallback."
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
