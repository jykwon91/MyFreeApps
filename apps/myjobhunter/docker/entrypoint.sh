#!/usr/bin/env bash
set -e

# Copy frontend dist to shared volume if FRONTEND_DIST_DIR is set (served by Caddy)
if [ -n "$FRONTEND_DIST_DIR" ] && [ -d /app/frontend-dist ]; then
    mkdir -p "$FRONTEND_DIST_DIR"
    cp -r /app/frontend-dist/. "$FRONTEND_DIST_DIR/" 2>/dev/null || true
fi

# Apply any pending migrations before the API starts (idempotent).
alembic upgrade head

exec "$@"
