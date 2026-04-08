#!/bin/bash
set -e

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[+]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[x]${NC} $1"; exit 1; }

# ─── Must run as root ─────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Run this script as root: sudo bash setup.sh"

echo ""
echo "========================================"
echo "  MyBookkeeper VPS Setup"
echo "========================================"
echo ""

REPO_URL="git@github.com:jykwon91/MyFreeApps.git"
DB_PASSWORD="$(openssl rand -hex 16)"
read -rp "Anthropic API Key: " ANTHROPIC_KEY
read -rp "Google Client ID: " GOOGLE_CLIENT_ID
read -rp "Google Client Secret: " GOOGLE_CLIENT_SECRET

APP_DIR=/srv/mybookkeeper
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
DOMAIN=$(echo $SERVER_IP | tr '.' '-').sslip.io
DB_URL="postgresql+asyncpg://mybookkeeper:${DB_PASSWORD}@localhost/mybookkeeper"
SECRET_KEY=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# ─── 1. System packages ───────────────────────────────────────────────────────
info "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

info "Installing Python 3.12..."
apt-get install -y -qq python3.12 python3.12-venv python3.12-dev python3-pip

info "Installing Node 20..."
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - &>/dev/null
    apt-get install -y -qq nodejs
fi

info "Installing PostgreSQL..."
apt-get install -y -qq postgresql postgresql-contrib

info "Installing Caddy..."
if ! command -v caddy &>/dev/null; then
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy
fi

apt-get install -y -qq git curl

# ─── 2. Create deploy user ────────────────────────────────────────────────────
info "Creating deploy user..."
if ! id deploy &>/dev/null; then
    useradd -m -s /bin/bash deploy
fi

# ─── 3. Clone repo ────────────────────────────────────────────────────────────
# Copy existing deploy key to deploy user
mkdir -p /home/deploy/.ssh
cp /root/.ssh/deploy_key /home/deploy/.ssh/deploy_key
chmod 600 /home/deploy/.ssh/deploy_key
cat > /home/deploy/.ssh/config <<'SSHCONFIG'
Host github.com
    IdentityFile ~/.ssh/deploy_key
    StrictHostKeyChecking no
SSHCONFIG
chmod 600 /home/deploy/.ssh/config
chown -R deploy:deploy /home/deploy/.ssh

info "Cloning repository..."
rm -rf $APP_DIR
mkdir -p $APP_DIR
chown deploy:deploy $APP_DIR
sudo -u deploy git clone "$REPO_URL" "$APP_DIR"

# ─── 4. Python venv + dependencies ───────────────────────────────────────────
info "Setting up Python virtual environment..."
sudo -u deploy python3.12 -m venv "$APP_DIR/apps/mybookkeeper/backend/.venv"
sudo -u deploy "$APP_DIR/apps/mybookkeeper/backend/.venv/bin/pip" install --quiet -r "$APP_DIR/apps/mybookkeeper/backend/requirements.txt"

# ─── 5. Frontend build ────────────────────────────────────────────────────────
info "Building frontend..."
sudo -u deploy bash -c "cd $APP_DIR/apps/mybookkeeper/frontend && npm install --silent && npm run build"

# ─── 6. PostgreSQL database ───────────────────────────────────────────────────
info "Creating PostgreSQL database and user..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='mybookkeeper'" | grep -q 1 \
    && sudo -u postgres psql -c "ALTER USER mybookkeeper WITH PASSWORD '${DB_PASSWORD}';" \
    || sudo -u postgres psql -c "CREATE USER mybookkeeper WITH PASSWORD '${DB_PASSWORD}';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='mybookkeeper'" \
    | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE mybookkeeper OWNER mybookkeeper;"

# ─── 7. Write .env ────────────────────────────────────────────────────────────
info "Writing production .env..."
cat > "$APP_DIR/apps/mybookkeeper/backend/.env" <<EOF
DATABASE_URL=${DB_URL}
SECRET_KEY=${SECRET_KEY}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
ANTHROPIC_API_KEY=${ANTHROPIC_KEY}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
FRONTEND_URL=https://${DOMAIN}
OAUTH_REDIRECT_URI=https://${DOMAIN}/api/integrations/gmail/callback
CORS_ORIGINS=["https://${DOMAIN}"]
JWT_LIFETIME_SECONDS=86400
GMAIL_POLL_INTERVAL_MINUTES=1440
MAX_UPLOADS_PER_USER_PER_DAY=2000
MAX_UPLOAD_SIZE_BYTES=104857600
EOF
chown deploy:deploy "$APP_DIR/apps/mybookkeeper/backend/.env"
chmod 600 "$APP_DIR/apps/mybookkeeper/backend/.env"

# ─── 7b. Database backup cron ─────────────────────────────────────────────────
info "Setting up automated database backups..."
chmod +x "$APP_DIR/apps/mybookkeeper/deploy/backup.sh"
chmod +x "$APP_DIR/apps/mybookkeeper/deploy/restore.sh"
mkdir -p /srv/mybookkeeper/backups
chown deploy:deploy /srv/mybookkeeper/backups

# Add daily backup cron at 2 AM (as deploy user)
sudo -u deploy bash -c '(crontab -l 2>/dev/null | grep -v "deploy/backup.sh"; echo "0 2 * * * /srv/mybookkeeper/apps/mybookkeeper/deploy/backup.sh >> /srv/mybookkeeper/backups/backup.log 2>&1") | crontab -'

# ─── 8. Run migrations ────────────────────────────────────────────────────────
info "Running database migrations..."
sudo -u deploy bash -c "cd $APP_DIR/apps/mybookkeeper/backend && source .venv/bin/activate && PYTHONPATH=$APP_DIR/apps/mybookkeeper/backend alembic upgrade head"

# ─── 9. Systemd services ─────────────────────────────────────────────────────
info "Installing systemd services..."
cp "$APP_DIR/apps/mybookkeeper/deploy/uvicorn.service"            /etc/systemd/system/
cp "$APP_DIR/apps/mybookkeeper/deploy/dramatiq-worker.service"    /etc/systemd/system/
cp "$APP_DIR/apps/mybookkeeper/deploy/dramatiq-scheduler.service" /etc/systemd/system/
cp "$APP_DIR/apps/mybookkeeper/deploy/upload-processor.service"   /etc/systemd/system/

# ─── 9b. Install scripts to /usr/local/sbin ──────────────────────────────────
info "Installing management scripts to /usr/local/sbin..."
for script in setup.sh update.sh backup.sh restore.sh; do
    cp "$APP_DIR/apps/mybookkeeper/deploy/$script" "/usr/local/sbin/mybookkeeper-${script%.sh}"
    chmod 755 "/usr/local/sbin/mybookkeeper-${script%.sh}"
done

# Allow deploy user to restart services without a password
cat > /etc/sudoers.d/deploy <<'SUDOERS'
deploy ALL=(ALL) NOPASSWD: \
    /bin/systemctl restart uvicorn, \
    /bin/systemctl restart dramatiq-worker, \
    /bin/systemctl restart dramatiq-scheduler, \
    /bin/systemctl restart upload-processor, \
    /bin/systemctl restart caddy, \
    /bin/cp /srv/mybookkeeper/apps/mybookkeeper/deploy/Caddyfile /etc/caddy/Caddyfile
SUDOERS

systemctl daemon-reload
systemctl enable uvicorn dramatiq-worker dramatiq-scheduler upload-processor
systemctl restart uvicorn dramatiq-worker dramatiq-scheduler upload-processor

# ─── 10. Caddy ────────────────────────────────────────────────────────────────
info "Configuring Caddy..."
cp "$APP_DIR/apps/mybookkeeper/deploy/Caddyfile" /etc/caddy/Caddyfile
systemctl enable caddy
systemctl restart caddy

# ─── 11. SSH key for GitHub Actions ──────────────────────────────────────────
info "Generating SSH key for GitHub Actions..."
sudo -u deploy bash -c "
    mkdir -p ~/.ssh
    chmod 700 ~/.ssh
    if [ ! -f ~/.ssh/github_actions ]; then
        ssh-keygen -t ed25519 -f ~/.ssh/github_actions -N '' -q
    fi
    cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
    sort -u ~/.ssh/authorized_keys -o ~/.ssh/authorized_keys
    chmod 600 ~/.ssh/authorized_keys
"

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "========================================"
echo -e "  ${GREEN}Setup complete!${NC}"
echo "========================================"
echo ""
echo "Services status:"
systemctl is-active uvicorn && echo "  ✓ uvicorn" || echo "  ✗ uvicorn (check: journalctl -u uvicorn -n 50)"
systemctl is-active caddy  && echo "  ✓ caddy"   || echo "  ✗ caddy (check: journalctl -u caddy -n 50)"
echo ""
echo "──────────────────────────────────────────"
echo "  GitHub Actions secrets to add:"
echo "  Go to: your GitHub repo → Settings → Secrets → Actions"
echo ""
echo "  SSH_HOST:        ${SERVER_IP} (or ${DOMAIN})"
echo "  SSH_USER:        deploy"
echo "  SSH_PRIVATE_KEY: (see below — copy the entire block)"
echo "──────────────────────────────────────────"
echo ""
cat /home/deploy/.ssh/github_actions
echo ""
echo "──────────────────────────────────────────"
echo "  Also update Google Cloud Console:"
echo "  Add authorized redirect URI:"
echo "  https://${DOMAIN}/api/integrations/gmail/callback"
echo "──────────────────────────────────────────"
echo ""
echo "  App will be available at: https://${DOMAIN}"
echo ""
