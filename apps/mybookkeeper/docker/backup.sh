#!/bin/bash
set -e

BACKUP_DIR="${BACKUP_DIR:-/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="mybookkeeper_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

PGPASSWORD="${DB_PASSWORD}" pg_dump -h postgres -U mybookkeeper mybookkeeper | gzip > "${BACKUP_DIR}/${FILENAME}"

# Retain last 30 days
find "${BACKUP_DIR}" -name "mybookkeeper_*.sql.gz" -mtime +30 -delete

echo "Backup completed: ${FILENAME}"
