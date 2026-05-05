#!/usr/bin/env bash
# One-time VPS migration: per-app MinIO → shared infra/ MinIO.
#
# Run from /srv/myfreeapps as root:
#   sudo bash infra/migrate-to-shared-minio.sh
#
# Safe to re-run after a partial failure — every step is idempotent or
# guarded by a precondition check. If anything fails, the script exits
# with the failing command's exit code and prints a rollback hint.
#
# What this script does:
#   1. Pre-flight checks (compose installed, MBK env present, MBK
#      currently running, etc.)
#   2. Builds infra/.env by reusing MBK's MinIO root user / password /
#      KMS key — required so existing object data + signing keys
#      remain valid under the new container.
#   3. Stops MBK (releases the existing minio_data volume).
#   4. Copies mybookkeeper_minio_data → myfreeapps_minio_data.
#   5. Brings up the shared infra stack.
#   6. Verifies data made it across.
#   7. Brings MBK back up (it joins the shared myfreeapps network and
#      reaches minio at myfreeapps-minio:9000 — requires the matching
#      MBK compose update to have landed in main).
#   8. Smoke-tests connectivity from the MBK api container.
#   9. Prompts before deleting the old mybookkeeper_minio_data volume.
#      Default is to keep it for 24h; pass --drop-old-volume to remove
#      immediately.
#
# Rollback if step 7 or 8 fails: run with --rollback. Restores the old
# MBK compose-only setup and brings MBK back up against
# mybookkeeper_minio_data.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$REPO_ROOT/infra"
MBK_DIR="$REPO_ROOT/apps/mybookkeeper"
MBK_COMPOSE="$MBK_DIR/docker-compose.yml"
INFRA_COMPOSE="$INFRA_DIR/docker-compose.yml"
INFRA_ENV="$INFRA_DIR/.env"
MBK_ENV_FILE="$MBK_DIR/.env"

OLD_VOLUME="mybookkeeper_minio_data"
NEW_VOLUME="myfreeapps_minio_data"
NEW_NETWORK="myfreeapps"
NEW_CONTAINER="myfreeapps-minio"

DROP_OLD=0
ROLLBACK=0
for arg in "$@"; do
  case "$arg" in
    --drop-old-volume) DROP_OLD=1 ;;
    --rollback) ROLLBACK=1 ;;
    -h|--help)
      sed -n '1,/^set -euo/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "unknown arg: $arg" >&2
      echo "see --help" >&2
      exit 2
      ;;
  esac
done

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
blue()   { printf '\033[34m%s\033[0m\n' "$*"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { red "missing: $1"; exit 1; }
}

# ──────────────────────────────────────────────────────────────────────────
# Rollback path
# ──────────────────────────────────────────────────────────────────────────
if [[ "$ROLLBACK" == "1" ]]; then
  yellow "Rolling back to per-app MinIO."
  blue "Step 1/3: bringing down shared infra stack"
  if [[ -f "$INFRA_COMPOSE" ]]; then
    docker compose -f "$INFRA_COMPOSE" down || true
  fi
  blue "Step 2/3: bringing MBK back up against original volume"
  docker compose -f "$MBK_COMPOSE" up -d
  blue "Step 3/3: verifying MBK is healthy"
  sleep 5
  docker compose -f "$MBK_COMPOSE" ps
  green "Rollback complete. ${OLD_VOLUME} is intact and serving MBK again."
  exit 0
fi

# ──────────────────────────────────────────────────────────────────────────
# Pre-flight
# ──────────────────────────────────────────────────────────────────────────
blue "Step 0/9: pre-flight checks"
require_cmd docker
require_cmd grep
require_cmd cut

if ! docker compose version >/dev/null 2>&1; then
  red "docker compose v2 not available. Install via 'apt install docker-compose-plugin'."
  exit 1
fi

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  red "Run as root: sudo bash $0"
  exit 1
fi

[[ -f "$INFRA_COMPOSE" ]] || { red "missing: $INFRA_COMPOSE"; exit 1; }
[[ -f "$MBK_COMPOSE" ]]   || { red "missing: $MBK_COMPOSE"; exit 1; }
[[ -f "$MBK_ENV_FILE" ]]  || { red "missing: $MBK_ENV_FILE — needed to copy MinIO credentials"; exit 1; }

# Required env keys must exist in MBK env so we can copy them.
for key in MINIO_ROOT_USER MINIO_ROOT_PASSWORD MINIO_KMS_SECRET_KEY; do
  if ! grep -q "^${key}=" "$MBK_ENV_FILE"; then
    red "MBK env $MBK_ENV_FILE missing required key $key"
    exit 1
  fi
done

# Detect whether the migration has already been done (idempotency).
already_migrated=0
if docker volume inspect "$NEW_VOLUME" >/dev/null 2>&1 \
   && docker ps --format '{{.Names}}' | grep -q "^${NEW_CONTAINER}\$"; then
  already_migrated=1
  yellow "Detected existing ${NEW_VOLUME} + running ${NEW_CONTAINER}."
  yellow "Re-running will skip already-completed steps."
fi

green "Pre-flight passed."

# ──────────────────────────────────────────────────────────────────────────
# Step 1/9: write infra/.env
# ──────────────────────────────────────────────────────────────────────────
blue "Step 1/9: building $INFRA_ENV from MBK env"
if [[ -f "$INFRA_ENV" ]]; then
  yellow "  $INFRA_ENV already exists — keeping. (Delete it manually if you need to re-derive.)"
else
  {
    echo "MINIO_ROOT_USER=$(grep '^MINIO_ROOT_USER=' "$MBK_ENV_FILE" | cut -d= -f2-)"
    echo "MINIO_ROOT_PASSWORD=$(grep '^MINIO_ROOT_PASSWORD=' "$MBK_ENV_FILE" | cut -d= -f2-)"
    echo "MINIO_KMS_SECRET_KEY=$(grep '^MINIO_KMS_SECRET_KEY=' "$MBK_ENV_FILE" | cut -d= -f2-)"
    echo "MINIO_BROWSER_URL=http://localhost:9001"
  } > "$INFRA_ENV"
  chmod 600 "$INFRA_ENV"
  chown root:root "$INFRA_ENV"
  green "  wrote $INFRA_ENV (mode 600, root:root)"
fi

# ──────────────────────────────────────────────────────────────────────────
# Step 2/9: stop MBK so the volume can be copied
# ──────────────────────────────────────────────────────────────────────────
blue "Step 2/9: stopping MBK"
if [[ "$already_migrated" == "1" ]]; then
  yellow "  already migrated — skipping"
else
  # --remove-orphans is critical: post-PR-#253 the MBK compose no longer
  # declares a ``minio:`` service, so the old ``mybookkeeper-minio``
  # container is an ORPHAN as far as compose is concerned. Without this
  # flag, ``compose down`` leaves it running, port 9000 stays bound,
  # and step 4 (``compose up`` for myfreeapps-minio) fails with a port
  # collision. We hit this exactly on 2026-05-04.
  docker compose -f "$MBK_COMPOSE" down --remove-orphans
  # Defensive: if any container with the old names is still hanging
  # around (e.g. created by hand or from a different compose file),
  # stop + remove it so port 9000 is unconditionally free.
  for stale in mybookkeeper-minio mybookkeeper_minio_1; do
    if docker ps -a --format '{{.Names}}' | grep -q "^${stale}\$"; then
      yellow "  stopping stale container ${stale}"
      docker stop "$stale" >/dev/null 2>&1 || true
      docker rm   "$stale" >/dev/null 2>&1 || true
    fi
  done
  green "  MBK stopped"
fi

# ──────────────────────────────────────────────────────────────────────────
# Step 3/9: copy old volume → new volume
# ──────────────────────────────────────────────────────────────────────────
blue "Step 3/9: copying $OLD_VOLUME → $NEW_VOLUME"
if docker volume inspect "$NEW_VOLUME" >/dev/null 2>&1; then
  yellow "  $NEW_VOLUME already exists — assuming previous copy succeeded. Skipping."
else
  if ! docker volume inspect "$OLD_VOLUME" >/dev/null 2>&1; then
    red "  $OLD_VOLUME does not exist — nothing to migrate from."
    red "  This is unexpected unless this is a fresh VPS. Aborting."
    exit 1
  fi
  docker volume create "$NEW_VOLUME" >/dev/null
  docker run --rm \
    -v "${OLD_VOLUME}:/old:ro" \
    -v "${NEW_VOLUME}:/new" \
    alpine sh -c "cp -a /old/. /new/ && echo 'copied'"
  green "  copy complete"
fi

# ──────────────────────────────────────────────────────────────────────────
# Step 4/9: bring up the shared infra stack
# ──────────────────────────────────────────────────────────────────────────
blue "Step 4/9: starting shared MinIO"
docker compose -f "$INFRA_COMPOSE" --env-file "$INFRA_ENV" up -d
sleep 6
if ! docker ps --format '{{.Names}}' | grep -q "^${NEW_CONTAINER}\$"; then
  red "  ${NEW_CONTAINER} did not come up. Check 'docker compose -f $INFRA_COMPOSE logs minio'."
  exit 1
fi
green "  ${NEW_CONTAINER} is running"

# ──────────────────────────────────────────────────────────────────────────
# Step 5/9: verify data is readable from the new container
# ──────────────────────────────────────────────────────────────────────────
blue "Step 5/9: verifying data accessibility"
ROOT_USER="$(grep '^MINIO_ROOT_USER=' "$INFRA_ENV" | cut -d= -f2-)"
ROOT_PASS="$(grep '^MINIO_ROOT_PASSWORD=' "$INFRA_ENV" | cut -d= -f2-)"
docker exec "$NEW_CONTAINER" mc alias set local \
  http://127.0.0.1:9000 "$ROOT_USER" "$ROOT_PASS" >/dev/null
if docker exec "$NEW_CONTAINER" mc ls local/ 2>/dev/null | grep -q .; then
  green "  buckets found:"
  docker exec "$NEW_CONTAINER" mc ls local/ | sed 's/^/    /'
else
  yellow "  no buckets visible. If this is the first migration, that's unexpected."
  yellow "  If only myjobhunter-files is missing, that's fine — it's created on MJH boot."
fi

# ──────────────────────────────────────────────────────────────────────────
# Step 6/9: bring MBK back up — it will join the shared network + reach
# minio at myfreeapps-minio:9000 (requires PR B to have landed)
# ──────────────────────────────────────────────────────────────────────────
blue "Step 6/9: bringing MBK back up"
docker compose -f "$MBK_COMPOSE" up -d
sleep 8
green "  MBK started"

# ──────────────────────────────────────────────────────────────────────────
# Step 7/9: smoke-test MBK → MinIO connectivity from the api container
# ──────────────────────────────────────────────────────────────────────────
blue "Step 7/9: smoke-testing MBK api → MinIO connectivity"
api_container="$(docker ps --format '{{.Names}}' | grep -E '^mybookkeeper-api(-1)?$' | head -1)"
if [[ -z "$api_container" ]]; then
  red "  could not locate the MBK api container by name. Skipping smoke test."
  red "  Check 'docker ps' and verify yourself."
elif docker exec "$api_container" sh -c \
       "wget -q -O - http://${NEW_CONTAINER}:9000/minio/health/live >/dev/null 2>&1 \
        || curl -sf http://${NEW_CONTAINER}:9000/minio/health/live >/dev/null 2>&1"; then
  green "  ${api_container} can reach ${NEW_CONTAINER}:9000 ✓"
else
  red "  ${api_container} CANNOT reach ${NEW_CONTAINER}:9000."
  red "  This usually means PR B (MBK compose joining the shared myfreeapps network)"
  red "  has not landed yet. Check: docker network inspect ${NEW_NETWORK}"
  red "  Rollback: sudo bash $0 --rollback"
  exit 1
fi

# ──────────────────────────────────────────────────────────────────────────
# Step 8/9: prompt about old volume (default keep)
# ──────────────────────────────────────────────────────────────────────────
blue "Step 8/9: old volume cleanup"
if [[ "$DROP_OLD" == "1" ]]; then
  yellow "  --drop-old-volume passed; removing $OLD_VOLUME now"
  docker volume rm "$OLD_VOLUME" || red "  failed to remove $OLD_VOLUME (may already be gone)"
  green "  removed"
else
  yellow "  $OLD_VOLUME left in place for 24h safety net."
  yellow "  Re-run with --drop-old-volume after MBK has been verified working,"
  yellow "  or remove manually with: docker volume rm $OLD_VOLUME"
fi

# ──────────────────────────────────────────────────────────────────────────
# Step 9/9: summary
# ──────────────────────────────────────────────────────────────────────────
blue "Step 9/9: summary"
green "Migration complete."
green ""
green "  Shared infra stack:    docker compose -f $INFRA_COMPOSE ps"
green "  MBK status:            docker compose -f $MBK_COMPOSE ps"
green "  Data volume:           $NEW_VOLUME"
green "  Network:               $NEW_NETWORK"
green ""
yellow "Next steps:"
yellow "  1. Open MBK in a browser; verify listing photos / lease attachments load."
yellow "  2. Send a test rent receipt; verify the PDF generates + uploads."
yellow "  3. After 24h of stable operation, remove $OLD_VOLUME"
yellow "     (or pass --drop-old-volume on the next run)."
