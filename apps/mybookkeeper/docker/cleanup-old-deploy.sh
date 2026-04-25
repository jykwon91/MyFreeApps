#!/bin/bash
set -e

# Clean up the old systemd/bare-metal deployment after Docker is running.
# Run AFTER verifying Docker stack is healthy:
#   curl http://localhost/api/health
#
# Usage: sudo bash docker/cleanup-old-deploy.sh

echo "=== Verifying Docker stack is running ==="
if ! docker compose ps --format json 2>/dev/null | grep -q '"running"'; then
    echo "ERROR: Docker stack is not running. Start it first with: docker compose up -d"
    exit 1
fi

echo "=== Stopping and disabling old systemd services ==="
for svc in uvicorn dramatiq-worker dramatiq-scheduler upload-processor; do
    systemctl stop "$svc" 2>/dev/null || true
    systemctl disable "$svc" 2>/dev/null || true
    rm -f "/etc/systemd/system/${svc}.service"
done
systemctl daemon-reload

echo "=== Stopping and removing system Caddy ==="
systemctl stop caddy 2>/dev/null || true
systemctl disable caddy 2>/dev/null || true
apt-get remove -y caddy 2>/dev/null || true

echo "=== Removing old Python venv ==="
rm -rf /srv/mybookkeeper/backend/.venv

echo "=== Removing old node_modules ==="
rm -rf /srv/mybookkeeper/frontend/node_modules

echo "=== Removing old backup cron ==="
crontab -u deploy -l 2>/dev/null | grep -v "backup.sh" | crontab -u deploy - 2>/dev/null || true

echo "=== Stopping system PostgreSQL (Docker has its own) ==="
systemctl stop postgresql 2>/dev/null || true
systemctl disable postgresql 2>/dev/null || true
echo "NOTE: PostgreSQL package left installed (pg_dump may be useful). Remove with: apt-get remove -y postgresql*"

echo "=== Removing old management scripts ==="
rm -f /usr/local/sbin/mybookkeeper-update
rm -f /usr/local/sbin/mybookkeeper-backup
rm -f /usr/local/sbin/mybookkeeper-restore
rm -f /usr/local/sbin/mybookkeeper-setup

echo "=== Done ==="
echo "Old deployment cleaned up. Docker is now the only thing running your app."
echo ""
echo "Verify: docker compose ps"
echo "Health: curl http://localhost/api/health"
