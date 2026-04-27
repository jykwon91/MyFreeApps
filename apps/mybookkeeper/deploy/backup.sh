#!/bin/bash
# MyBookkeeper Database + MinIO Backup Script
# Run via cron: 0 2 * * * /srv/mybookkeeper/deploy/backup.sh
set -euo pipefail

BACKUP_DIR="/srv/mybookkeeper/backups"
DB_NAME="mybookkeeper"
DB_USER="mybookkeeper"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"
MINIO_BACKUP_FILE="${BACKUP_DIR}/minio_data_${TIMESTAMP}.tar.gz"
MINIO_VOLUME="${MINIO_VOLUME:-mybookkeeper_minio_data}"

mkdir -p "$BACKUP_DIR"

# 1. PostgreSQL dump
pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"

if [ ! -s "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file is empty — $BACKUP_FILE" >&2
    rm -f "$BACKUP_FILE"
    exit 1
fi

echo "DB backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# 2. MinIO data volume snapshot — uses a throwaway alpine container to tar
#    the volume contents. Skipped if Docker isn't available or the volume
#    doesn't exist (e.g., on a host that hasn't deployed the MinIO service
#    yet — graceful for first-deploy and CI environments).
if command -v docker >/dev/null 2>&1 && docker volume inspect "$MINIO_VOLUME" >/dev/null 2>&1; then
    docker run --rm \
        -v "$MINIO_VOLUME:/data:ro" \
        -v "$BACKUP_DIR:/backups" \
        alpine \
        sh -c "cd /data && tar czf /backups/$(basename "$MINIO_BACKUP_FILE") ."

    if [ -s "$MINIO_BACKUP_FILE" ]; then
        echo "MinIO backup created: $MINIO_BACKUP_FILE ($(du -h "$MINIO_BACKUP_FILE" | cut -f1))"
    else
        echo "WARNING: MinIO backup is empty — $MINIO_BACKUP_FILE" >&2
        rm -f "$MINIO_BACKUP_FILE"
    fi
else
    echo "Skipping MinIO backup — Docker volume $MINIO_VOLUME not present"
fi

# 3. Clean up old backups (both DB and MinIO).
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
find "$BACKUP_DIR" -name "minio_data_*.tar.gz" -mtime +${RETENTION_DAYS} -delete
echo "Cleaned up backups older than ${RETENTION_DAYS} days"
