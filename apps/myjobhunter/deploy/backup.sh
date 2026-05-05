#!/bin/bash
# MyJobHunter Database + MinIO Backup Script
#
# Run on the VPS via systemd timer (apps/myjobhunter/deploy/myjobhunter-backup.timer)
# OR via crontab (`0 2 * * * /srv/myfreeapps/apps/myjobhunter/deploy/backup.sh`).
#
# Mirrors apps/mybookkeeper/deploy/backup.sh with two intentional divergences:
#   1. MJH's postgres runs INSIDE docker (whereas MBK runs PG natively on
#      the host). pg_dump is invoked via `docker compose exec` so the
#      script works without installing PG client tools on the VPS.
#   2. MJH's MinIO is shared infra (apps/../infra/docker-compose.yml owns
#      the myfreeapps-minio container), so the bucket-level backup belongs
#      with the infra layer — NOT this per-app script. We only back up the
#      DB here.

set -euo pipefail

# Resolve absolute path so this script works regardless of CWD when invoked
# via cron / systemd. SCRIPT_DIR points at apps/myjobhunter/deploy/.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$APP_DIR/docker-compose.yml"
ENV_FILE="$APP_DIR/.env"

BACKUP_DIR="${BACKUP_DIR:-/srv/myfreeapps/apps/myjobhunter/backups}"
DB_NAME="${DB_NAME:-myjobhunter}"
DB_USER="${DB_USER:-myjobhunter}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

# pg_dump runs inside the postgres container so we don't need PG client
# tools installed on the VPS. The container has direct local-socket
# access to its own datadir, so no password / auth is needed.
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"

if [ ! -s "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file is empty — $BACKUP_FILE" >&2
    rm -f "$BACKUP_FILE"
    exit 1
fi

echo "DB backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Clean up old backups beyond retention.
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"${RETENTION_DAYS}" -delete
echo "Cleaned up backups older than ${RETENTION_DAYS} days"
