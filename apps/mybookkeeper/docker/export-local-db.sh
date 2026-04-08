#!/bin/bash
set -e

# Export local dev database as a clean dump (no test data, no Dramatiq tables)
# Usage: bash docker/export-local-db.sh
# Output: mybookkeeper_clean.dump in project root

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-postgres}"
DB_NAME="mybookkeeper"
CLEAN_DB="mybookkeeper_clean"
OUTPUT_FILE="mybookkeeper_clean.dump"

echo "=== Exporting clean database dump ==="
echo "Source: ${DB_NAME} on ${PGHOST}:${PGPORT}"

# 1. Create a temporary copy
echo "1/4 Creating temporary database copy..."
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${CLEAN_DB}' AND pid <> pg_backend_pid();" > /dev/null 2>&1 || true
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -c "DROP DATABASE IF EXISTS ${CLEAN_DB};" > /dev/null
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -c "CREATE DATABASE ${CLEAN_DB} TEMPLATE ${DB_NAME};"

# 2. Remove test/E2E data from the copy
echo "2/4 Removing test data..."
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$CLEAN_DB" -c "
DELETE FROM transactions WHERE vendor ILIKE '%E2E%' OR vendor ILIKE '%test%';
DELETE FROM documents WHERE file_name = 'plumber-invoice.pdf';
DELETE FROM properties WHERE name ILIKE '%E2E%' OR name ILIKE '%test%';
DELETE FROM tax_returns WHERE filing_status = 'head_of_household';
DELETE FROM classification_rules WHERE match_pattern ILIKE '%E2E%' OR match_pattern ILIKE '%test%';
"

# 3. Dump the clean copy
echo "3/4 Dumping to ${OUTPUT_FILE}..."
pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -Fc --no-owner --no-privileges "$CLEAN_DB" > "$OUTPUT_FILE"

# 4. Drop the temporary database
echo "4/4 Cleaning up temporary database..."
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -c "DROP DATABASE ${CLEAN_DB};"

SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
echo ""
echo "=== Done! ==="
echo "Output: ${OUTPUT_FILE} (${SIZE})"
echo ""
echo "Next steps:"
echo "  1. SCP to VPS:  scp ${OUTPUT_FILE} deploy@<VPS_IP>:/srv/mybookkeeper/"
echo "  2. On VPS:      cd /srv/mybookkeeper && ./docker/migrate-to-prod.sh ${OUTPUT_FILE}"
