#!/usr/bin/env bash
# One-shot: provision a per-app MinIO service-account on the shared
# infra stack, then wire its credentials into the app's .env.docker so
# the next deploy can use them.
#
# Usage:
#   sudo bash infra/bootstrap-app-minio.sh <app-slug>
#   sudo bash infra/bootstrap-app-minio.sh myjobhunter
#
# The app slug must:
#   - have an apps/<slug>/backend/.env.docker file already in place
#   - reference MINIO_ACCESS_KEY / MINIO_SECRET_KEY / MINIO_BUCKET in
#     its config (most apps do via their .env.docker.example)
#
# What this script does:
#   1. Pre-flight (myfreeapps-minio running, MBK env present, app dir
#      present, no existing service account already provisioned).
#   2. Generates fresh access_key + secret_key.
#   3. Creates the user on the shared MinIO + attaches the readwrite
#      policy.
#   4. Writes MINIO_* env vars into the app's .env.docker (preserves
#      existing values for keys other than MINIO_ACCESS_KEY /
#      MINIO_SECRET_KEY / MINIO_ENDPOINT / MINIO_PUBLIC_ENDPOINT /
#      MINIO_BUCKET — those are overwritten with the canonical
#      shared-stack values).
#   5. Restarts the app's api service so it picks up the new creds.
#
# Idempotency: if the user already exists in MinIO, the script
# refuses to proceed and asks the operator to run with --rotate to
# regenerate credentials. Without --rotate, re-running is safe (no-op).
#
# Rollback: --rollback <slug> removes the service account from MinIO
# and clears the MINIO_ACCESS_KEY / MINIO_SECRET_KEY lines from the
# app's .env.docker. Object data on disk is NOT touched — the operator
# must drop the bucket separately if they want.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
blue()   { printf '\033[34m%s\033[0m\n' "$*"; }

ROTATE=0
ROLLBACK=0
APP_SLUG=""

for arg in "$@"; do
  case "$arg" in
    --rotate)   ROTATE=1 ;;
    --rollback) ROLLBACK=1 ;;
    -h|--help)
      sed -n '1,/^set -euo/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      if [[ -z "$APP_SLUG" ]]; then
        APP_SLUG="$arg"
      else
        red "extra arg: $arg"
        exit 2
      fi
      ;;
  esac
done

[[ -n "$APP_SLUG" ]] || { red "missing <app-slug>"; echo "usage: sudo bash $0 <app-slug>" >&2; exit 2; }

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  red "Run as root: sudo bash $0 $APP_SLUG"
  exit 1
fi

APP_DIR="$REPO_ROOT/apps/$APP_SLUG"
APP_ENV_FILE="$APP_DIR/backend/.env.docker"
APP_COMPOSE="$APP_DIR/docker-compose.yml"
INFRA_ENV="$REPO_ROOT/infra/.env"
MINIO_CONTAINER="myfreeapps-minio"
BUCKET="${APP_SLUG}-files"
PUBLIC_ENDPOINT="https://storage.165-245-134-251.sslip.io"

[[ -d "$APP_DIR" ]]      || { red "missing: $APP_DIR"; exit 1; }
[[ -f "$APP_ENV_FILE" ]] || { red "missing: $APP_ENV_FILE"; exit 1; }
[[ -f "$APP_COMPOSE" ]]  || { red "missing: $APP_COMPOSE"; exit 1; }
[[ -f "$INFRA_ENV" ]]    || { red "missing: $INFRA_ENV — bring up infra stack first"; exit 1; }

if ! docker ps --format '{{.Names}}' | grep -q "^${MINIO_CONTAINER}\$"; then
  red "$MINIO_CONTAINER is not running."
  red "Bring up the shared infra stack first: docker compose -f infra/docker-compose.yml --env-file infra/.env up -d"
  exit 1
fi

# Authenticate against the shared MinIO using its root credentials.
ROOT_USER="$(grep '^MINIO_ROOT_USER=' "$INFRA_ENV" | cut -d= -f2-)"
ROOT_PASS="$(grep '^MINIO_ROOT_PASSWORD=' "$INFRA_ENV" | cut -d= -f2-)"
docker exec "$MINIO_CONTAINER" mc alias set local \
  "http://127.0.0.1:9000" "$ROOT_USER" "$ROOT_PASS" >/dev/null

# ──────────────────────────────────────────────────────────────────────────
# Rollback path
# ──────────────────────────────────────────────────────────────────────────
if [[ "$ROLLBACK" == "1" ]]; then
  yellow "Rolling back ${APP_SLUG} MinIO bootstrap."
  EXISTING_KEY="$(grep '^MINIO_ACCESS_KEY=' "$APP_ENV_FILE" | cut -d= -f2- | tr -d '\r' || true)"
  if [[ -n "$EXISTING_KEY" ]]; then
    docker exec "$MINIO_CONTAINER" mc admin user remove local "$EXISTING_KEY" 2>&1 \
      | sed 's/^/    /' || true
    sed -i.bak '/^MINIO_ACCESS_KEY=/d; /^MINIO_SECRET_KEY=/d' "$APP_ENV_FILE"
    green "  removed user $EXISTING_KEY + cleared keys from $APP_ENV_FILE"
  else
    yellow "  no MINIO_ACCESS_KEY in $APP_ENV_FILE — nothing to roll back"
  fi
  yellow "Bucket $BUCKET (and its data) is left intact. Drop manually if desired:"
  yellow "  docker exec $MINIO_CONTAINER mc rb --force local/$BUCKET"
  exit 0
fi

# ──────────────────────────────────────────────────────────────────────────
# Forward path
# ──────────────────────────────────────────────────────────────────────────
blue "Bootstrapping MinIO service account for app: $APP_SLUG"

# Idempotency: if the env already has working credentials, refuse.
EXISTING_KEY="$(grep '^MINIO_ACCESS_KEY=' "$APP_ENV_FILE" | cut -d= -f2- | tr -d '\r' || true)"
if [[ -n "$EXISTING_KEY" ]] && [[ "$ROTATE" != "1" ]]; then
  if docker exec "$MINIO_CONTAINER" mc admin user info local "$EXISTING_KEY" >/dev/null 2>&1; then
    yellow "Service account $EXISTING_KEY already exists for $APP_SLUG."
    yellow "  This is a no-op. To regenerate credentials, run with --rotate."
    yellow "  To remove credentials, run with --rollback."
    exit 0
  fi
fi

if [[ "$ROTATE" == "1" && -n "$EXISTING_KEY" ]]; then
  yellow "  --rotate: removing existing user $EXISTING_KEY"
  docker exec "$MINIO_CONTAINER" mc admin user remove local "$EXISTING_KEY" 2>&1 \
    | sed 's/^/    /' || true
fi

# Generate fresh credentials.
ACCESS_KEY="$(openssl rand -hex 16)"
SECRET_KEY="$(openssl rand -hex 32)"

blue "Step 1/3: provisioning user + policy on shared MinIO"
docker exec "$MINIO_CONTAINER" mc admin user add local "$ACCESS_KEY" "$SECRET_KEY"
docker exec "$MINIO_CONTAINER" mc admin policy attach local readwrite --user="$ACCESS_KEY"
green "  user $ACCESS_KEY created + readwrite policy attached"

blue "Step 2/3: writing credentials into $APP_ENV_FILE"
# Strip any existing MINIO_* lines so the rewrite is clean.
sed -i.bak '/^MINIO_ENDPOINT=/d; /^MINIO_PUBLIC_ENDPOINT=/d; /^MINIO_ACCESS_KEY=/d; /^MINIO_SECRET_KEY=/d; /^MINIO_BUCKET=/d; /^MINIO_SECURE=/d' "$APP_ENV_FILE"
# Append canonical values.
{
  echo ""
  echo "# MinIO storage — managed by infra/bootstrap-app-minio.sh"
  echo "MINIO_ENDPOINT=${MINIO_CONTAINER}:9000"
  echo "MINIO_PUBLIC_ENDPOINT=${PUBLIC_ENDPOINT}"
  echo "MINIO_ACCESS_KEY=${ACCESS_KEY}"
  echo "MINIO_SECRET_KEY=${SECRET_KEY}"
  echo "MINIO_BUCKET=${BUCKET}"
  echo "MINIO_SECURE=false"
} >> "$APP_ENV_FILE"
chmod 600 "$APP_ENV_FILE"
green "  wrote MINIO_* keys (backup at ${APP_ENV_FILE}.bak)"

blue "Step 3/3: restarting $APP_SLUG api so it picks up the new credentials"
docker compose -f "$APP_COMPOSE" restart api
sleep 12
docker compose -f "$APP_COMPOSE" ps

green ""
green "Done. $APP_SLUG can now read/write s3://$BUCKET on the shared MinIO."
green ""
yellow "Next steps:"
yellow "  - Smoke-test the app's upload feature in a browser."
yellow "  - Bucket $BUCKET is created automatically on backend boot via the"
yellow "    lifespan bucket-initializer (no manual mc mb needed)."
yellow "  - Rotate creds in the future with: sudo bash $0 $APP_SLUG --rotate"
