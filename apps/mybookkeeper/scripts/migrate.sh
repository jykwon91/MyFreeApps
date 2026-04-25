#!/usr/bin/env bash
#
# migrate.sh — Run alembic upgrade head with verification.
# Catches silent rollbacks that alembic doesn't report.
#
# Usage:
#   bash scripts/migrate.sh              # upgrade to head
#   bash scripts/migrate.sh --status     # show current vs head revision
#
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")/../backend" && pwd)"
cd "$BACKEND_DIR"

# Activate venv
if [ -f .venv/Scripts/activate ]; then
  source .venv/Scripts/activate
elif [ -f .venv/bin/activate ]; then
  source .venv/bin/activate
else
  echo "ERROR: No virtualenv found at backend/.venv" >&2
  exit 1
fi

ALEMBIC=".venv/Scripts/alembic"
[ -f "$ALEMBIC" ] || ALEMBIC=".venv/bin/alembic"
[ -f "$ALEMBIC" ] || ALEMBIC="alembic"

get_current_rev() {
  $ALEMBIC current 2>/dev/null | grep -oE '^[a-f0-9]{12}' | head -1
}

get_head_rev() {
  # Try `alembic heads` first. If it fails (e.g. broken import in old migration),
  # fall back to scanning migration files for the latest revision.
  local head
  head=$($ALEMBIC heads 2>/dev/null | grep -oE '^[a-f0-9]{12}' | head -1)
  if [ -n "$head" ]; then
    echo "$head"
    return
  fi
  # Fallback: find the migration file whose down_revision matches no other file's revision
  # (i.e., it's the tip of the chain). Simpler: just get the newest migration file.
  local latest_file
  latest_file=$(ls -t "$BACKEND_DIR/alembic/versions"/*.py 2>/dev/null | head -1)
  if [ -n "$latest_file" ]; then
    grep "^revision" "$latest_file" | grep -oE "'[a-f0-9]+'" | tr -d "'" | head -1
  fi
}

# --status: just show where we are
if [ "${1:-}" = "--status" ]; then
  CURRENT=$(get_current_rev)
  HEAD=$(get_head_rev)
  if [ -z "$CURRENT" ]; then
    echo "Current: (none — database may be empty)"
  else
    echo "Current: $CURRENT"
  fi
  if [ -z "$HEAD" ]; then
    echo "Head:    (could not determine)"
  else
    echo "Head:    $HEAD"
  fi
  if [ "$CURRENT" = "$HEAD" ]; then
    echo "Status:  UP TO DATE"
  else
    echo "Status:  PENDING MIGRATIONS"
  fi
  exit 0
fi

# Record pre-migration state
BEFORE=$(get_current_rev)
echo "Current revision: ${BEFORE:-(none)}"

# Check if already at head
HEAD=$(get_head_rev)
if [ -n "$HEAD" ] && [ "$BEFORE" = "$HEAD" ]; then
  echo "Already at head ($HEAD). Nothing to do."
  exit 0
fi

echo "Head revision:    ${HEAD:-(unknown)}"
echo ""
echo "Running alembic upgrade head..."
echo "================================"

# Run migration, capture output and exit code
MIGRATE_OUTPUT=$($ALEMBIC upgrade head 2>&1) || {
  echo "MIGRATION FAILED (alembic exited non-zero)" >&2
  echo "$MIGRATE_OUTPUT" >&2
  exit 1
}

echo "$MIGRATE_OUTPUT"
echo "================================"
echo ""

# Verify: did the revision actually change?
AFTER=$(get_current_rev)

if [ -z "$AFTER" ]; then
  echo "ERROR: Could not read alembic version after migration." >&2
  echo "The database may be in an inconsistent state." >&2
  exit 1
fi

if [ "$BEFORE" = "$AFTER" ]; then
  echo "MIGRATION FAILED SILENTLY" >&2
  echo "" >&2
  echo "  Alembic reported success but the revision did not advance." >&2
  echo "  Before: $BEFORE" >&2
  echo "  After:  $AFTER" >&2
  echo "  Expected: $HEAD" >&2
  echo "" >&2
  echo "  This usually means the migration DDL caused an error that was" >&2
  echo "  silently rolled back. Common causes:" >&2
  echo "    - sa.text() in create_index (use op.execute with raw SQL instead)" >&2
  echo "    - asyncpg driver incompatibility with DDL operations" >&2
  echo "    - Foreign key references to nonexistent tables" >&2
  echo "" >&2
  echo "  To debug, run: alembic upgrade head --sql | tail -50" >&2
  echo "  Or check PostgreSQL logs for the actual error." >&2
  exit 1
fi

if [ "$AFTER" != "$HEAD" ]; then
  echo "WARNING: Migration partially applied." >&2
  echo "  Before: $BEFORE" >&2
  echo "  After:  $AFTER" >&2
  echo "  Head:   $HEAD" >&2
  echo "  Run again to apply remaining migrations." >&2
  exit 1
fi

echo "Migration successful: $BEFORE → $AFTER"
