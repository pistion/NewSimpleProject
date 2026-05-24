#!/bin/sh
set -eu

# Render start command wrapper.
# The persistent disk is mounted at runtime only, so disk-backed paths are
# prepared here rather than during the build command.

DISK=/var/glondia
if [ -d "$DISK" ]; then
  echo "[start] Initialising persistent disk directories under $DISK..."
  mkdir -p "$DISK/data" "$DISK/tmp" "$DISK/.npm-cache"
  export NPM_CONFIG_CACHE="$DISK/.npm-cache"
  echo "[start] Disk ready. NPM_CONFIG_CACHE=$NPM_CONFIG_CACHE"
fi

MAX_RETRIES=15
RETRY_DELAY=5
attempt=0

echo "[start] Running database migrations..."
until npx prisma migrate deploy; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$MAX_RETRIES" ]; then
    echo "[start] ERROR: Migration failed after $MAX_RETRIES attempts. Giving up."
    exit 1
  fi
  echo "[start] Migration attempt $attempt/$MAX_RETRIES failed. Retrying in ${RETRY_DELAY}s..."
  sleep "$RETRY_DELAY"
done

echo "[start] Migrations complete. Starting NestJS..."
exec node dist/main.js
