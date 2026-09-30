#!/usr/bin/env bash
set -e

# Apply any pending migrations before the API starts (idempotent).
alembic upgrade head

exec "$@"
