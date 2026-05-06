#!/usr/bin/env bash
# Recover MyBookkeeper MinIO objects that did not carry across the
# 2026-05-04 migration from per-app MinIO → shared infra/ MinIO.
#
# Symptom this script fixes: GET /api/signed-leases/<id> returns
# attachments with ``presigned_url=null`` and ``is_available=false``,
# meaning the DB row references a key that doesn't exist in the new
# shared bucket. Verified case: lease 25463728-889a-48fa-a942-6507d1d4adaf
# (Sonu King) — 4 attachments missing including 1 - Lease Agreement.pdf.
#
# What this script does:
#   1. Verifies the OLD ``mybookkeeper_minio_data`` Docker volume still
#      exists on the host. If it doesn't, we're out of options — the
#      operator must restore from VPS-level disk snapshots or accept
#      data loss.
#   2. Spins up a TEMPORARY read-only MinIO container against that
#      volume on port 19000 (so it doesn't collide with the running
#      shared MinIO on 9000).
#   3. Configures ``mc`` aliases for both the old (read-only) and the
#      new (current shared) MinIO endpoints, using credentials from
#      ``apps/mybookkeeper/backend/.env.docker``.
#   4. Runs ``mc mirror --overwrite=false`` from old → new, copying
#      ONLY keys that don't already exist in the new bucket. Will not
#      modify or delete anything.
#   5. Reports a summary: total keys in old, keys already in new, keys
#      newly copied, keys still missing (i.e., genuinely lost).
#   6. Tears down the temporary container.
#
# Run from /srv/myfreeapps as root:
#   sudo bash infra/recover-mbk-minio-objects.sh
#
# Idempotent — safe to re-run. The mirror flag means re-runs only
# copy keys that are still missing.
#
# Safety:
#   - The old volume is mounted READ-ONLY in the temp container so a
#     bug in this script can't corrupt the source data.
#   - mc mirror with --overwrite=false NEVER overwrites a key that
#     already exists in the destination, so we can't accidentally
#     replace a fresh upload with a stale copy.
#   - The temp container is named ``mbk-recovery-temp`` and stops on
#     exit (trap). Use --keep-temp to preserve it for inspection.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$REPO_ROOT/infra"
MBK_DIR="$REPO_ROOT/apps/mybookkeeper"
MBK_ENV_DOCKER="$MBK_DIR/backend/.env.docker"
INFRA_ENV="$INFRA_DIR/.env"

OLD_VOLUME="mybookkeeper_minio_data"
NEW_CONTAINER="myfreeapps-minio"
NEW_NETWORK="myfreeapps"
TEMP_CONTAINER="mbk-recovery-temp"
TEMP_PORT=19000
BUCKET="mybookkeeper-files"

KEEP_TEMP=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --keep-temp) KEEP_TEMP=1 ;;
    --dry-run) DRY_RUN=1 ;;
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

cleanup() {
  if [[ "$KEEP_TEMP" == "0" ]]; then
    docker rm -f "$TEMP_CONTAINER" >/dev/null 2>&1 || true
  else
    yellow "--keep-temp: leaving $TEMP_CONTAINER running on :$TEMP_PORT"
  fi
}
trap cleanup EXIT

# ──────────────────────────────────────────────────────────────────────────
# Pre-flight
# ──────────────────────────────────────────────────────────────────────────
require_cmd docker

blue "Step 1/6: pre-flight checks"

if ! docker volume inspect "$OLD_VOLUME" >/dev/null 2>&1; then
  red "OLD volume '$OLD_VOLUME' does not exist on this host."
  red ""
  red "There is nothing to recover from. Options:"
  red "  - Restore from a VPS-level disk snapshot taken before 2026-05-04 20:00 UTC"
  red "  - Accept data loss; operator should re-upload from local copies"
  exit 1
fi
green "  ✓ old volume present: $OLD_VOLUME"

if ! docker network inspect "$NEW_NETWORK" >/dev/null 2>&1; then
  red "shared network '$NEW_NETWORK' missing — is the infra stack up?"
  red "run: docker compose -f $INFRA_DIR/docker-compose.yml up -d"
  exit 1
fi
green "  ✓ shared network present: $NEW_NETWORK"

if ! docker ps --format '{{.Names}}' | grep -qx "$NEW_CONTAINER"; then
  red "shared MinIO container '$NEW_CONTAINER' is not running"
  red "run: docker compose -f $INFRA_DIR/docker-compose.yml up -d"
  exit 1
fi
green "  ✓ shared MinIO container running: $NEW_CONTAINER"

if [[ ! -f "$INFRA_ENV" ]]; then
  red "shared infra env file missing: $INFRA_ENV"
  exit 1
fi

# Pull MinIO root creds from the shared infra .env. The migration script
# wrote MBK's existing root user/password into this file so old
# encrypted objects remain readable.
# shellcheck disable=SC1090
source "$INFRA_ENV"
: "${MINIO_ROOT_USER:?MINIO_ROOT_USER must be set in $INFRA_ENV}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD must be set in $INFRA_ENV}"
green "  ✓ MinIO root credentials loaded from $INFRA_ENV"

# ──────────────────────────────────────────────────────────────────────────
# Bring up a temporary read-only MinIO against the old volume
# ──────────────────────────────────────────────────────────────────────────
blue "Step 2/6: starting temporary MinIO against $OLD_VOLUME (read-only) on :$TEMP_PORT"

# If a stale temp container exists from a prior aborted run, remove it.
docker rm -f "$TEMP_CONTAINER" >/dev/null 2>&1 || true

docker run -d \
  --name "$TEMP_CONTAINER" \
  --network "$NEW_NETWORK" \
  -p "127.0.0.1:${TEMP_PORT}:9000" \
  -e "MINIO_ROOT_USER=$MINIO_ROOT_USER" \
  -e "MINIO_ROOT_PASSWORD=$MINIO_ROOT_PASSWORD" \
  -v "${OLD_VOLUME}:/data:ro" \
  --restart no \
  minio/minio:RELEASE.2025-09-07T16-13-09Z \
  server /data >/dev/null

# Give MinIO a few seconds to come up.
for i in {1..20}; do
  if docker exec "$TEMP_CONTAINER" mc alias set self http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec "$TEMP_CONTAINER" mc alias set self http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; then
  red "temp MinIO failed to start within 20s"
  docker logs "$TEMP_CONTAINER" | tail -50 || true
  exit 1
fi
green "  ✓ temp MinIO up; reachable inside container as 'self'"

# ──────────────────────────────────────────────────────────────────────────
# Inspect the old volume
# ──────────────────────────────────────────────────────────────────────────
blue "Step 3/6: inspecting old volume contents"

if ! docker exec "$TEMP_CONTAINER" mc ls "self/$BUCKET" >/dev/null 2>&1; then
  red "bucket '$BUCKET' not found in old volume"
  red "the old volume may be from a different MBK install — recovery not applicable"
  exit 1
fi

OLD_KEY_COUNT=$(docker exec "$TEMP_CONTAINER" mc find "self/$BUCKET" --type f 2>/dev/null | wc -l)
green "  ✓ old bucket has $OLD_KEY_COUNT objects"

# ──────────────────────────────────────────────────────────────────────────
# Configure mc inside the temp container to also see the SHARED MinIO
# ──────────────────────────────────────────────────────────────────────────
blue "Step 4/6: configuring mc for shared MinIO"

docker exec "$TEMP_CONTAINER" mc alias set shared "http://${NEW_CONTAINER}:9000" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null

NEW_KEY_COUNT_BEFORE=$(docker exec "$TEMP_CONTAINER" mc find "shared/$BUCKET" --type f 2>/dev/null | wc -l)
green "  ✓ shared bucket currently has $NEW_KEY_COUNT_BEFORE objects"

# ──────────────────────────────────────────────────────────────────────────
# Mirror missing keys
# ──────────────────────────────────────────────────────────────────────────
if [[ "$DRY_RUN" == "1" ]]; then
  blue "Step 5/6: DRY RUN — listing keys in old NOT in shared"
  docker exec "$TEMP_CONTAINER" sh -c "
    diff \
      <(mc find self/$BUCKET --type f | sed 's|self/||' | sort) \
      <(mc find shared/$BUCKET --type f | sed 's|shared/||' | sort) \
      | grep '^<' | sed 's/^< //'
  " | head -200
  yellow "  ↑ keys above would be copied. Re-run without --dry-run to actually mirror."
  exit 0
fi

blue "Step 5/6: mirroring missing keys (--overwrite=false)"
# mc mirror with --overwrite=false skips keys that already exist in the
# destination — exactly what we want. Watch flag is omitted so we run
# once and exit.
docker exec "$TEMP_CONTAINER" \
  mc mirror --overwrite=false --preserve "self/$BUCKET" "shared/$BUCKET"

NEW_KEY_COUNT_AFTER=$(docker exec "$TEMP_CONTAINER" mc find "shared/$BUCKET" --type f 2>/dev/null | wc -l)
COPIED=$((NEW_KEY_COUNT_AFTER - NEW_KEY_COUNT_BEFORE))
green "  ✓ mirror complete: $COPIED objects newly copied"

# ──────────────────────────────────────────────────────────────────────────
# Verify the previously-failing keys
# ──────────────────────────────────────────────────────────────────────────
blue "Step 6/6: verifying recovery for known-missing lease (Sonu King)"

KNOWN_MISSING_PREFIX="signed-leases/25463728-889a-48fa-a942-6507d1d4adaf"
RECOVERED=$(docker exec "$TEMP_CONTAINER" mc find "shared/$BUCKET/$KNOWN_MISSING_PREFIX" --type f 2>/dev/null | wc -l)
echo "  $RECOVERED objects now present under $KNOWN_MISSING_PREFIX/"
if [[ "$RECOVERED" -ge 1 ]]; then
  green "  ✓ Sonu King lease attachments recovered"
else
  yellow "  ⚠ no objects found under $KNOWN_MISSING_PREFIX — they may not exist in the old volume either"
  yellow "    (operator may need VPS disk snapshot or local re-upload)"
fi

# ──────────────────────────────────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────────────────────────────────
echo
green "Summary:"
green "  Old bucket objects:       $OLD_KEY_COUNT"
green "  Shared bucket before:     $NEW_KEY_COUNT_BEFORE"
green "  Shared bucket after:      $NEW_KEY_COUNT_AFTER"
green "  Newly copied:             $COPIED"
echo
green "Next steps:"
green "  1. Reload the affected lease in the browser (hard-refresh)."
green "  2. Verify is_available=true now in the API response."
green "  3. The temp container will be cleaned up on script exit."
green "     If you want to keep it for further mc inspection, re-run with --keep-temp."
green "  4. The OLD volume '$OLD_VOLUME' is preserved untouched — delete it"
green "     manually after a few days of confirmed recovery:"
green "     docker volume rm $OLD_VOLUME"
