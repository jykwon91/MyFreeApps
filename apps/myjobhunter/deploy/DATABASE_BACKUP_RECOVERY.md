# MyJobHunter Database Backup + Recovery

Mirrors apps/mybookkeeper/deploy/DATABASE_BACKUP_RECOVERY.md with paths
adjusted for MJH's location at `/srv/myfreeapps/apps/myjobhunter/`.

## What gets backed up

- **PostgreSQL DB** (`myjobhunter` database, all tables) — gzipped SQL
  dump via `pg_dump`. One file per run, named
  `myjobhunter_YYYYMMDD_HHMMSS.sql.gz`.

## What does NOT get backed up by this script

- **MinIO object storage** — MJH's MinIO is shared infra, owned by
  `infra/docker-compose.yml`. Bucket-level backups belong with the
  infra layer, not this per-app script.
- **Backend/frontend code** — already in git.
- **`.env.docker` files** — operator should keep these in their
  password manager. The setup script does NOT regenerate them.

## Backup location + retention

- Path: `/srv/myfreeapps/apps/myjobhunter/backups/`
- Retention: 30 days (older files deleted by the script)
- Filename pattern: `myjobhunter_YYYYMMDD_HHMMSS.sql.gz`

Override with env vars passed to the script:
```bash
BACKUP_DIR=/different/path RETENTION_DAYS=7 /srv/myfreeapps/apps/myjobhunter/deploy/backup.sh
```

## Schedule

Two equivalent options — pick one.

### Option A: systemd timer (recommended)

Install once on the VPS:

```bash
sudo cp /srv/myfreeapps/apps/myjobhunter/deploy/myjobhunter-backup.service \
        /etc/systemd/system/
sudo cp /srv/myfreeapps/apps/myjobhunter/deploy/myjobhunter-backup.timer \
        /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now myjobhunter-backup.timer
```

Verify:
```bash
sudo systemctl list-timers | grep myjobhunter
# expected: next run at 02:00 tomorrow

sudo journalctl -u myjobhunter-backup.service --since "1 hour ago"
# expected: clean log + "DB backup created: ..."
```

### Option B: crontab

Add to root's crontab (`sudo crontab -e`):
```cron
0 2 * * * /srv/myfreeapps/apps/myjobhunter/deploy/backup.sh
```

Then verify:
```bash
ls -la /srv/myfreeapps/apps/myjobhunter/backups/
# expected: at least one .sql.gz file the morning after install
```

## Manual backup (run anytime)

```bash
sudo /srv/myfreeapps/apps/myjobhunter/deploy/backup.sh
```

The script is idempotent (no harm in running multiple times in a day —
each gets its own timestamped filename).

## Restore from a backup

**WARNING: this is destructive — the existing DB contents are dropped.**

```bash
# Stop the api + worker containers so nothing tries to write during restore
cd /srv/myfreeapps/apps/myjobhunter
docker compose stop api resume-parser

# Pick the backup to restore
BACKUP_FILE=/srv/myfreeapps/apps/myjobhunter/backups/myjobhunter_20260505_020000.sql.gz

# Drop + recreate the DB inside the postgres container
docker compose exec -T postgres psql -U myjobhunter -c "DROP DATABASE IF EXISTS myjobhunter_restore_tmp;"
docker compose exec -T postgres psql -U myjobhunter -c "CREATE DATABASE myjobhunter_restore_tmp;"

# Stream the backup in
gunzip -c "$BACKUP_FILE" | docker compose exec -T postgres psql -U myjobhunter myjobhunter_restore_tmp

# If the restore looks good (run sanity queries against myjobhunter_restore_tmp first):
docker compose exec -T postgres psql -U myjobhunter -c "DROP DATABASE myjobhunter;"
docker compose exec -T postgres psql -U myjobhunter -c "ALTER DATABASE myjobhunter_restore_tmp RENAME TO myjobhunter;"

# Restart the app
docker compose start api resume-parser
```

## Smoke test the backup right after installing

After running steps in Option A or B, manually trigger one run to confirm everything works:

```bash
# systemd timer:
sudo systemctl start myjobhunter-backup.service
sudo journalctl -u myjobhunter-backup.service -f
# Ctrl+C once you see "DB backup created"

# Or directly:
sudo /srv/myfreeapps/apps/myjobhunter/deploy/backup.sh
ls -la /srv/myfreeapps/apps/myjobhunter/backups/
```

## Off-host replication (recommended)

This script writes to local disk only. If the VPS volume is lost, you
lose all backups. Replicate to a remote location nightly:

- **Cheapest**: `rclone sync /srv/myfreeapps/apps/myjobhunter/backups/ b2:my-bucket/myjobhunter-backups/`
- **AWS**: `aws s3 sync ...`

Add as a second cron entry / second systemd timer that fires after the local
backup completes (e.g., 02:30).
