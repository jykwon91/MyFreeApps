#!/bin/bash
set -e

# Migrate data from a dev machine dump to Docker PostgreSQL.
# Usage: ./docker/migrate-to-prod.sh <mybookkeeper.dump>
#
# First create the dump on your dev machine:
#   pg_dump -h localhost -p 5433 -U <user> -Fc --no-owner --no-privileges \
#     --exclude-table='dramatiq_*' mybookkeeper > mybookkeeper.dump

if [ -z "$1" ]; then
    echo "Usage: migrate-to-prod.sh <mybookkeeper.dump>"
    echo ""
    echo "First create the dump on your dev machine:"
    echo "  pg_dump -h localhost -p 5433 -U <user> -Fc --no-owner --no-privileges --exclude-table='dramatiq_*' mybookkeeper > mybookkeeper.dump"
    exit 1
fi

DUMP_FILE="$1"

echo "=== Pre-migration checks ==="
docker compose exec postgres psql -U mybookkeeper -c "SELECT version();"
docker compose exec postgres psql -U mybookkeeper -c "SELECT gen_random_uuid();"

echo "=== Restoring dump ==="
docker compose cp "${DUMP_FILE}" postgres:/tmp/restore.dump
docker compose exec postgres pg_restore -U mybookkeeper -d mybookkeeper \
    --no-owner --no-privileges --clean --if-exists /tmp/restore.dump || true

echo "=== Running migrations ==="
docker compose run --rm migrate

echo "=== Verifying ==="
docker compose exec postgres psql -U mybookkeeper -d mybookkeeper \
    -c "SELECT COUNT(*) as transactions FROM transactions; SELECT COUNT(*) as documents FROM documents; SELECT COUNT(*) as properties FROM properties;"

echo "Migration complete!"
