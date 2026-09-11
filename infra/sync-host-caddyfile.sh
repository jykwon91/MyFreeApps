#!/usr/bin/env bash
# Sync the SHARED host Caddyfile (infra/Caddyfile) → /etc/caddy/Caddyfile and
# reload host Caddy when it differs. The shared file holds blocks for every app
# (plus the myfreeapps.org landing page) so a deploy of one does not wipe
# another's host-Caddy entry.
#
# Run from the /srv/myfreeapps checkout by every deploy workflow — the rendered
# deploy-<app>.yml files and deploy-landing.yml:
#   sudo bash infra/sync-host-caddyfile.sh
#
# Validates the repo copy BEFORE installing it, so a broken Caddyfile never
# lands in /etc/caddy (where it would stop host Caddy from starting on reboot).
set -euo pipefail

cd "$(dirname "$0")/.."

if diff -q infra/Caddyfile /etc/caddy/Caddyfile > /dev/null 2>&1; then
  echo "Host Caddyfile already up to date"
  exit 0
fi

echo "Host Caddyfile differs from repo — updating"
caddy validate --config infra/Caddyfile --adapter caddyfile
cp infra/Caddyfile /etc/caddy/Caddyfile
caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
echo "Host Caddy reloaded with new config"
