#!/bin/bash
# MyBookkeeper Database Restore Script
# Usage: sudo bash restore.sh /srv/mybookkeeper/backups/mybookkeeper_20260316.sql.gz
set -euo pipefail

BACKUP_FILE="${1:-}"
DB_NAME="mybookkeeper"
DB_USER="mybookkeeper"
APP_DIR="/srv/mybookkeeper"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    echo ""
    echo "Available backups:"
    ls -lh /srv/mybookkeeper/backups/*.sql.gz 2>/dev/null || echo "  No backups found"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE" >&2
    exit 1
fi

echo "WARNING: This will DROP and recreate the '$DB_NAME' database."
echo "Backup file: $BACKUP_FILE"
read -rp "Continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

echo "Stopping application services..."
systemctl stop uvicorn dramatiq-worker dramatiq-scheduler 2>/dev/null || true

echo "Dropping and recreating database..."
sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" 2>/dev/null || true
sudo -u postgres psql -c "DROP DATABASE IF EXISTS ${DB_NAME};"
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

echo "Restoring from backup..."
gunzip -c "$BACKUP_FILE" | sudo -u postgres psql "$DB_NAME"

echo "Running any pending migrations..."
sudo -u deploy bash -c "cd $APP_DIR/backend && source .venv/bin/activate && PYTHONPATH=$APP_DIR/backend alembic upgrade head"

echo "Restarting services..."
systemctl start uvicorn dramatiq-worker dramatiq-scheduler

echo "Restore complete. Verify at: https://$(hostname -f)/health"
