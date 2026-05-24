#!/bin/sh
# start.sh — Render start command wrapper
#
# 1. Creates required subdirectories on the persistent SSD (first-boot).
# 2. Retries `prisma migrate deploy` until the database accepts connections.
# 3. Hands off to the NestJS process via exec (replaces this shell).
#
# Why retries: on Render's free/starter tier, the Postgres instance can take
# 10-30 s to become available after a cold deploy.  Without retries, the first
# migration attempt fails and the service exits immediately, showing
# ERR_CONNECTION_REFUSED to the frontend until Render restarts it.

# ── Create persistent-disk directories if the disk is mounted ────────────────
# The disk is only available at runtime, not during the Render build phase.
# We check for it before using it so local dev (no disk) still works fine.
DISK=/var/glondia
if [ -d "$DISK" ]; then
  echo "[start] Initialising persistent disk directories under $DISK …"
  mkdir -p "$DISK/data" "$DISK/tmp" "$DISK/.npm-cache"
  # Point npm's package cache at the persistent disk so that packages
  # downloaded for one user's project build are reused by the next.
  # This is set here (not as a Render env var) because the disk isn't
  # mounted during the build phase and npm would error trying to write there.
  export NPM_CONFIG_CACHE="$DISK/.npm-cache"
  echo "[start] Disk ready. NPM_CONFIG_CACHE=$NPM_CONFIG_CACHE"
fi

MAX_RETRIES=15      # 15 × 5 s = up to 75 s wait
RETRY_DELAY=5       # seconds between attempts
attempt=0

echo "[start] Running database migrations..."

until npx prisma migrate deploy; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$MAX_RETRIES" ]; then
    echo "[start] ERROR: Migration failed after $MAX_RETRIES attempts. Giving up."
    exit 1
  fi
  echo "[start] Migration attempt $attempt/$MAX_RETRIES failed — database not ready yet. Retrying in ${RETRY_DELAY}s..."
  sleep "$RETRY_DELAY"
done

echo "[start] Migrations complete. Starting NestJS..."
exec node dist/main
