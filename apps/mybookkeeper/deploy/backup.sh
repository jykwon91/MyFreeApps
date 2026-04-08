#!/bin/bash
# MyBookkeeper Database Backup Script
# Run via cron: 0 2 * * * /srv/mybookkeeper/apps/mybookkeeper/deploy/backup.sh
set -euo pipefail

BACKUP_DIR="/srv/mybookkeeper/backups"
DB_NAME="mybookkeeper"
DB_USER="mybookkeeper"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

# Dump and compress
pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"

# Verify the backup is non-empty
if [ ! -s "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file is empty — $BACKUP_FILE" >&2
    rm -f "$BACKUP_FILE"
    exit 1
fi

echo "Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Remove backups older than retention period
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
echo "Cleaned up backups older than ${RETENTION_DAYS} days"
