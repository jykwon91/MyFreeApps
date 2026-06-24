#!/usr/bin/env bash
# Idempotent host hardening to stop the shared 24GB droplet from filling up.
#
# Usage:
#   sudo bash infra/harden-vps-disk.sh
#   sudo bash infra/harden-vps-disk.sh --check   # report drift only, change nothing
#
# Two unbounded growth sources filled the disk to 99% on 2026-06-23:
#   1. Docker container logs — the default json-file driver has NO rotation,
#      so a chatty container's stdout grows without limit.
#   2. systemd journald — uncapped, observed at ~2GB.
#
# The registry-image accumulation (the third source) is handled separately by
# the per-deploy `docker image prune` step in the deploy workflow
# (infra/templates/.github/workflows/deploy.yml.j2). This script handles the
# two host-daemon configs that a deploy step cannot reach.
#
# What this script does (each step is idempotent + a no-op when already set):
#   1. /etc/docker/daemon.json — set json-file logging with rotation
#      (max-size 10m, max-file 3). MERGES with any existing keys (notably
#      `data-root`) instead of clobbering. Restarts dockerd only if changed.
#   2. /etc/systemd/journald.conf — set SystemMaxUse=200M. Restarts
#      systemd-journald only if changed.
#
# Re-running is safe: if both configs already match, the script makes no
# change and restarts nothing. Run it on every (re-)provision of a host so a
# rebuilt droplet inherits the caps automatically.
#
# Note on existing containers: the daemon.json log-opts apply to containers
# CREATED after dockerd restarts. Already-running containers keep their old
# (uncapped) log config until their next recreate — which the next deploy
# does anyway (`docker compose up -d` recreates on image change). No manual
# per-container surgery is required.
set -euo pipefail

DOCKER_DAEMON_JSON="/etc/docker/daemon.json"
JOURNALD_CONF="/etc/systemd/journald.conf"
LOG_MAX_SIZE="10m"
LOG_MAX_FILE="3"
JOURNALD_MAX_USE="200M"

CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    -h|--help)
      sed -n '1,/^set -euo/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "unknown arg: $arg" >&2
      echo "usage: sudo bash $0 [--check]" >&2
      exit 2
      ;;
  esac
done

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
blue()   { printf '\033[34m%s\033[0m\n' "$*"; }

if [[ "$CHECK_ONLY" != "1" ]] && [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  red "Run as root: sudo bash $0"
  exit 1
fi

DOCKER_CHANGED=0
JOURNALD_CHANGED=0

# ──────────────────────────────────────────────────────────────────────────
# 1. Docker daemon log rotation — merge into existing daemon.json
# ──────────────────────────────────────────────────────────────────────────
blue "Step 1/2: Docker container-log rotation ($DOCKER_DAEMON_JSON)"

# Desired log-opts as JSON. We MERGE these into whatever already exists so a
# pre-existing `data-root` (or any other key) is preserved. python3 is present
# on every Ubuntu host and gives us a real JSON parser (no jq dependency).
read -r -d '' MERGE_PY <<'PY' || true
import json, sys

path = sys.argv[1]
max_size = sys.argv[2]
max_file = sys.argv[3]

try:
    with open(path, "r", encoding="utf-8") as f:
        current = json.load(f)
    if not isinstance(current, dict):
        current = {}
except FileNotFoundError:
    current = {}
except json.JSONDecodeError:
    # Malformed file — do not silently clobber. Surface and bail.
    sys.stderr.write("MALFORMED")
    sys.exit(3)

desired = dict(current)
desired["log-driver"] = "json-file"
log_opts = dict(desired.get("log-opts", {}))
log_opts["max-size"] = max_size
log_opts["max-file"] = max_file
desired["log-opts"] = log_opts

if desired == current:
    print("UNCHANGED")
else:
    # Emit the merged document on stdout for the caller to write.
    sys.stdout.write("CHANGED\n")
    sys.stdout.write(json.dumps(desired, indent=2, sort_keys=True) + "\n")
PY

DAEMON_OUT="$(python3 -c "$MERGE_PY" "$DOCKER_DAEMON_JSON" "$LOG_MAX_SIZE" "$LOG_MAX_FILE" 2>/dev/null || echo "ERROR")"

if [[ "$DAEMON_OUT" == "ERROR" ]] || [[ "$DAEMON_OUT" == *MALFORMED* ]]; then
  red "  $DOCKER_DAEMON_JSON is malformed JSON — refusing to overwrite."
  red "  Fix it by hand, then re-run. Desired keys:"
  red "    \"log-driver\": \"json-file\", \"log-opts\": {\"max-size\": \"$LOG_MAX_SIZE\", \"max-file\": \"$LOG_MAX_FILE\"}"
  exit 1
fi

if [[ "$DAEMON_OUT" == "UNCHANGED" ]]; then
  green "  already capped (max-size=$LOG_MAX_SIZE, max-file=$LOG_MAX_FILE) — no change"
else
  MERGED_JSON="${DAEMON_OUT#CHANGED$'\n'}"
  if [[ "$CHECK_ONLY" == "1" ]]; then
    yellow "  [check] would update $DOCKER_DAEMON_JSON to:"
    echo "$MERGED_JSON" | sed 's/^/      /'
  else
    mkdir -p "$(dirname "$DOCKER_DAEMON_JSON")"
    [[ -f "$DOCKER_DAEMON_JSON" ]] && cp "$DOCKER_DAEMON_JSON" "${DOCKER_DAEMON_JSON}.bak"
    printf '%s\n' "$MERGED_JSON" > "$DOCKER_DAEMON_JSON"
    DOCKER_CHANGED=1
    green "  wrote rotation config (backup at ${DOCKER_DAEMON_JSON}.bak)"
  fi
fi

# ──────────────────────────────────────────────────────────────────────────
# 2. journald size cap
# ──────────────────────────────────────────────────────────────────────────
blue "Step 2/2: journald size cap ($JOURNALD_CONF SystemMaxUse=$JOURNALD_MAX_USE)"

journald_is_capped() {
  [[ -f "$JOURNALD_CONF" ]] && grep -Eq "^[[:space:]]*SystemMaxUse=${JOURNALD_MAX_USE}[[:space:]]*$" "$JOURNALD_CONF"
}

if journald_is_capped; then
  green "  already set (SystemMaxUse=$JOURNALD_MAX_USE) — no change"
elif [[ "$CHECK_ONLY" == "1" ]]; then
  yellow "  [check] would set SystemMaxUse=$JOURNALD_MAX_USE in $JOURNALD_CONF"
else
  [[ -f "$JOURNALD_CONF" ]] && cp "$JOURNALD_CONF" "${JOURNALD_CONF}.bak"
  # Remove any existing SystemMaxUse line (commented or not) then append ours.
  if [[ -f "$JOURNALD_CONF" ]]; then
    sed -i -E '/^[[:space:]]*#?[[:space:]]*SystemMaxUse=/d' "$JOURNALD_CONF"
  else
    printf '[Journal]\n' > "$JOURNALD_CONF"
  fi
  # Ensure a [Journal] section header exists.
  grep -q '^\[Journal\]' "$JOURNALD_CONF" || printf '[Journal]\n' >> "$JOURNALD_CONF"
  printf 'SystemMaxUse=%s\n' "$JOURNALD_MAX_USE" >> "$JOURNALD_CONF"
  JOURNALD_CHANGED=1
  green "  set SystemMaxUse=$JOURNALD_MAX_USE (backup at ${JOURNALD_CONF}.bak)"
fi

# ──────────────────────────────────────────────────────────────────────────
# Restart only the daemons whose config actually changed.
# ──────────────────────────────────────────────────────────────────────────
if [[ "$CHECK_ONLY" == "1" ]]; then
  blue "Check-only mode — no daemons restarted."
  exit 0
fi

if [[ "$DOCKER_CHANGED" == "1" ]]; then
  blue "Restarting dockerd to apply log rotation…"
  systemctl restart docker
  green "  dockerd restarted"
fi

if [[ "$JOURNALD_CHANGED" == "1" ]]; then
  blue "Restarting systemd-journald to apply size cap…"
  systemctl restart systemd-journald
  # Vacuum existing journal down to the new cap immediately.
  journalctl --vacuum-size="$JOURNALD_MAX_USE" >/dev/null 2>&1 || true
  green "  systemd-journald restarted + vacuumed to $JOURNALD_MAX_USE"
fi

green ""
if [[ "$DOCKER_CHANGED" == "0" && "$JOURNALD_CHANGED" == "0" ]]; then
  green "Nothing to do — host already hardened against disk fill."
else
  green "Done. Host disk-fill caps applied."
fi
