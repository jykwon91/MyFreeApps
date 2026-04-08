#!/bin/bash
set -e

if [ -z "$1" ]; then
    echo "Usage: restore.sh <backup-file.sql.gz>"
    exit 1
fi

echo "WARNING: This will replace all data in the database."
echo "Restoring from: $1"

# Terminate active connections and recreate the database
PGPASSWORD="${DB_PASSWORD}" psql -h postgres -U mybookkeeper -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='mybookkeeper' AND pid <> pg_backend_pid();"
PGPASSWORD="${DB_PASSWORD}" psql -h postgres -U mybookkeeper -d postgres \
    -c "DROP DATABASE IF EXISTS mybookkeeper;"
PGPASSWORD="${DB_PASSWORD}" psql -h postgres -U mybookkeeper -d postgres \
    -c "CREATE DATABASE mybookkeeper OWNER mybookkeeper;"

# Restore from compressed dump
gunzip -c "$1" | PGPASSWORD="${DB_PASSWORD}" psql -h postgres -U mybookkeeper -d mybookkeeper

# Run migrations to apply any schema changes newer than the backup
cd /app && alembic upgrade head

echo "Restore complete."
