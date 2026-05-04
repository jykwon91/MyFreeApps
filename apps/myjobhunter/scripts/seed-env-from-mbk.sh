#!/usr/bin/env bash
# Seed MJH env files from MBK on the same VPS.
#
# Reads safe-to-reuse keys from MBK's running config (Anthropic API key,
# log level, lockout/rate-limit tunables), generates fresh secrets for
# anything per-app (SECRET_KEY, ENCRYPTION_KEY, DB_PASSWORD), and leaves
# blank fields for things that MUST be MJH-specific (Google OAuth,
# Turnstile, frontend URL).
#
# Usage:
#   sudo bash apps/myjobhunter/scripts/seed-env-from-mbk.sh
#
# Idempotency:
#   If $MJH_ENV_DOCKER already exists with content, it is moved to
#   <path>.bak.<unix-ts> and a new file written. Nothing is silently lost.
#
# Manual follow-up after this script runs:
#   vim /srv/myfreeapps/apps/myjobhunter/backend/.env.docker
#   # fill in FRONTEND_URL, CORS_ORIGINS, GOOGLE_CLIENT_ID/SECRET,
#   # TURNSTILE_*, optionally TAVILY_API_KEY

set -euo pipefail

MBK_ENV=/srv/myfreeapps/apps/mybookkeeper/backend/.env.docker
MJH_DIR=/srv/myfreeapps/apps/myjobhunter
MJH_ENV_DOCKER=$MJH_DIR/backend/.env.docker
MJH_COMPOSE_ENV=$MJH_DIR/.env

[[ -f $MBK_ENV ]] || { echo "MBK env not found: $MBK_ENV"; exit 1; }
[[ -d $MJH_DIR ]] || { echo "MJH dir not found: $MJH_DIR"; exit 1; }

if [[ -f $MJH_ENV_DOCKER && -s $MJH_ENV_DOCKER ]]; then
    backup="$MJH_ENV_DOCKER.bak.$(date +%s)"
    mv "$MJH_ENV_DOCKER" "$backup"
    echo "Backed up existing $MJH_ENV_DOCKER -> $backup"
fi

# Pull a key's value from MBK env. Returns empty string if not found.
# Without `|| true` set -e + pipefail kills the script when grep finds nothing.
get_mbk() {
    local val
    val=$(grep -E "^$1=" "$MBK_ENV" 2>/dev/null | head -1 || true)
    [[ -z "$val" ]] && return 0
    echo "${val#*=}"
}

gen_secret()   { openssl rand -base64 64 | tr -d '\n/+=' | head -c 64 ; }
gen_password() { openssl rand -base64 32 | tr -d '\n/+=' | head -c 40 ; }

DB_PASSWORD=$(gen_password)
SECRET_KEY=$(gen_secret)
ENCRYPTION_KEY=$(gen_secret)

ANTHROPIC_API_KEY=$(get_mbk ANTHROPIC_API_KEY)
HIBP_ENABLED=$(get_mbk HIBP_ENABLED)
LOG_LEVEL=$(get_mbk LOG_LEVEL)
JWT_LIFETIME_SECONDS=$(get_mbk JWT_LIFETIME_SECONDS)
LOCKOUT_THRESHOLD=$(get_mbk LOCKOUT_THRESHOLD)
LOCKOUT_AUTORESET_HOURS=$(get_mbk LOCKOUT_AUTORESET_HOURS)
LOGIN_RATE_LIMIT_THRESHOLD=$(get_mbk LOGIN_RATE_LIMIT_THRESHOLD)
LOGIN_RATE_LIMIT_WINDOW_SECONDS=$(get_mbk LOGIN_RATE_LIMIT_WINDOW_SECONDS)

# Compose-level .env (only DB_PASSWORD lives here per docker-compose.yml)
{
    echo "DB_PASSWORD=$DB_PASSWORD"
} > "$MJH_COMPOSE_ENV"

# Backend .env.docker
{
    echo "# Generated $(date -u +%Y-%m-%dT%H:%M:%SZ) by seed-env-from-mbk.sh"
    echo ""
    echo "# Generated fresh (do NOT reuse from MBK)"
    echo "SECRET_KEY=$SECRET_KEY"
    echo "ENCRYPTION_KEY=$ENCRYPTION_KEY"
    echo ""
    echo "# Reused from MBK (same Claude account, same defaults)"
    echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
    echo "HIBP_ENABLED=${HIBP_ENABLED:-true}"
    echo "LOG_LEVEL=${LOG_LEVEL:-INFO}"
    echo "JWT_LIFETIME_SECONDS=${JWT_LIFETIME_SECONDS:-1800}"
    echo "LOCKOUT_THRESHOLD=${LOCKOUT_THRESHOLD:-5}"
    echo "LOCKOUT_AUTORESET_HOURS=${LOCKOUT_AUTORESET_HOURS:-24}"
    echo "LOGIN_RATE_LIMIT_THRESHOLD=${LOGIN_RATE_LIMIT_THRESHOLD:-10}"
    echo "LOGIN_RATE_LIMIT_WINDOW_SECONDS=${LOGIN_RATE_LIMIT_WINDOW_SECONDS:-300}"
    echo ""
    echo "# MJH-specific — fill in via vim after this script runs"
    echo "TAVILY_API_KEY="
    echo "GOOGLE_CLIENT_ID="
    echo "GOOGLE_CLIENT_SECRET="
    echo "TURNSTILE_SECRET_KEY="
    echo "TURNSTILE_SITE_KEY="
    echo "FRONTEND_URL=https://myjobhunter.165-245-134-251.sslip.io"
    echo 'CORS_ORIGINS=["https://myjobhunter.165-245-134-251.sslip.io"]'
    echo ""
    echo "EMAIL_BACKEND=console"
    echo "EMAIL_FROM_NAME=MyJobHunter"
    echo "SMTP_HOST="
    echo "SMTP_PORT=587"
    echo "SMTP_USER="
    echo "SMTP_PASSWORD="
} > "$MJH_ENV_DOCKER"

chmod 600 "$MJH_ENV_DOCKER" "$MJH_COMPOSE_ENV"
chown root:root "$MJH_ENV_DOCKER" "$MJH_COMPOSE_ENV"

echo "Written:"
ls -la "$MJH_ENV_DOCKER" "$MJH_COMPOSE_ENV"
echo
echo "Now: vim $MJH_ENV_DOCKER  # fill in FRONTEND_URL, CORS_ORIGINS, OAuth, Turnstile, optionally Tavily"
