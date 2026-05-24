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
DISK=/var/glondia
if [ -d "$DISK" ]; then
  echo "[start] Initialising persistent disk directories under $DISK …"
  mkdir -p "$DISK/data" "$DISK/tmp" "$DISK/.npm-cache"
  echo "[start] Disk directories ready."
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
