#!/bin/bash
set -e

echo "=== PostgreSQL Pre-Migration Checks ==="

echo "1. Version check (need >= 13)..."
docker compose exec postgres psql -U mybookkeeper -c "SELECT version();"

echo "2. UUID extension..."
docker compose exec postgres psql -U mybookkeeper -c "SELECT gen_random_uuid();"

echo "3. Encoding..."
docker compose exec postgres psql -U mybookkeeper -c "SHOW server_encoding;"

echo "4. Collation..."
docker compose exec postgres psql -U mybookkeeper -c "SHOW lc_collate;"

echo "All checks passed!"
