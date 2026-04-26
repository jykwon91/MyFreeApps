# Database Backup, Restore & Recovery

## Automated Backups

Backups run daily at 2 AM via cron (set up by `setup.sh`).

- **Location:** `/srv/mybookkeeper/backups/`
- **Format:** `mybookkeeper_YYYYMMDD_HHMMSS.sql.gz` (compressed SQL dump)
- **Retention:** 30 days (older backups auto-deleted)
- **Log:** `/srv/mybookkeeper/backups/backup.log`

### Verify backups are running

```bash
# Check cron is set up
sudo -u deploy crontab -l

# Check recent backups
ls -lh /srv/mybookkeeper/backups/

# Check backup log
tail -20 /srv/mybookkeeper/backups/backup.log
```

### Run a manual backup

```bash
sudo -u deploy /srv/mybookkeeper/deploy/backup.sh
```

## Restore from Backup

### Full restore (replaces entire database)

```bash
sudo bash /srv/mybookkeeper/deploy/restore.sh /srv/mybookkeeper/backups/mybookkeeper_20260316_020000.sql.gz
```

This will:
1. Stop all application services (uvicorn, dramatiq workers)
2. Terminate active database connections
3. Drop and recreate the database
4. Restore from the backup file
5. Run any pending Alembic migrations
6. Restart all services

### Restore to a specific point in time

Pick the backup closest to (but before) your target time:

```bash
ls -l /srv/mybookkeeper/backups/ | grep "20260315"
sudo bash /srv/mybookkeeper/deploy/restore.sh /srv/mybookkeeper/backups/mybookkeeper_20260315_020000.sql.gz
```

## Disaster Recovery Scenarios

### Scenario 1: Accidental data deletion

A user or bug deletes important documents.

1. Identify the last good backup (before the deletion):
   ```bash
   ls -lt /srv/mybookkeeper/backups/ | head -10
   ```
2. Restore from that backup:
   ```bash
   sudo bash /srv/mybookkeeper/deploy/restore.sh /path/to/backup.sql.gz
   ```
3. Any data created after the backup timestamp will be lost.

### Scenario 2: Database corruption

PostgreSQL won't start or reports data corruption.

1. Stop PostgreSQL:
   ```bash
   sudo systemctl stop postgresql
   ```
2. Check logs for the cause:
   ```bash
   sudo journalctl -u postgresql -n 100
   ```
3. If recoverable, start PostgreSQL and run `pg_resetwal` (last resort).
4. If not recoverable, reinstall PostgreSQL and restore:
   ```bash
   sudo apt-get install --reinstall postgresql
   sudo -u postgres createuser mybookkeeper
   sudo -u postgres createdb mybookkeeper -O mybookkeeper
   sudo bash /srv/mybookkeeper/deploy/restore.sh /path/to/latest/backup.sql.gz
   ```

### Scenario 3: Server loss (full VPS rebuild)

The entire server is lost and needs to be rebuilt from scratch.

1. Provision a new VPS with the same OS (Ubuntu/Debian)
2. Copy the SSH deploy key to `/root/.ssh/deploy_key`
3. Run the setup script:
   ```bash
   sudo bash setup.sh
   ```
4. Copy the latest backup file from offsite storage to the new server
5. Restore:
   ```bash
   sudo bash /srv/mybookkeeper/deploy/restore.sh /path/to/backup.sql.gz
   ```
6. Update DNS / Google OAuth redirect URI to point to the new server

### Scenario 4: Migration failure

An Alembic migration fails after deploying new code.

1. Check the migration error:
   ```bash
   cd /srv/mybookkeeper/backend
   source .venv/bin/activate
   alembic history
   alembic current
   ```
2. If the migration partially applied, downgrade:
   ```bash
   alembic downgrade -1
   ```
3. If the database is in a bad state, restore from the pre-deploy backup:
   ```bash
   sudo bash /srv/mybookkeeper/deploy/restore.sh /path/to/pre-deploy-backup.sql.gz
   ```
4. Fix the migration code, then retry:
   ```bash
   alembic upgrade head
   ```

## Offsite Backup (Recommended)

For protection against server loss, copy backups to an offsite location. Add this to the cron or as a post-backup hook:

### Option A: S3-compatible storage

```bash
# Install AWS CLI
apt-get install -y awscli

# Add to backup.sh or as a separate cron:
aws s3 cp "$BACKUP_FILE" s3://your-bucket/mybookkeeper-backups/
```

### Option B: rsync to another server

```bash
rsync -az /srv/mybookkeeper/backups/ user@backup-server:/backups/mybookkeeper/
```

## Testing Backups

Periodically verify backups can be restored:

```bash
# Create a test database from the latest backup
LATEST=$(ls -t /srv/mybookkeeper/backups/*.sql.gz | head -1)
sudo -u postgres createdb mybookkeeper_test
gunzip -c "$LATEST" | sudo -u postgres psql mybookkeeper_test

# Verify data
sudo -u postgres psql mybookkeeper_test -c "SELECT count(*) FROM documents;"
sudo -u postgres psql mybookkeeper_test -c "SELECT count(*) FROM users;"

# Clean up
sudo -u postgres dropdb mybookkeeper_test
```
