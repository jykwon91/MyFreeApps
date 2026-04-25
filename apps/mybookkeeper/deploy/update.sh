#!/bin/bash
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; exit 1; }

APP_DIR=/srv/mybookkeeper

[[ $EUID -ne 0 ]] && error "Run as root: sudo bash update.sh"

info "Creating pre-deploy backup..."
sudo -u deploy "$APP_DIR/deploy/backup.sh"

info "Pulling latest code..."
sudo -u deploy git -C "$APP_DIR" pull --ff-only || error "Git pull failed — resolve conflicts manually"

info "Installing backend dependencies..."
sudo -u deploy bash -c "cd $APP_DIR/backend && source .venv/bin/activate && pip install --quiet -r requirements.txt"

info "Running database migrations..."
sudo -u deploy bash -c "cd $APP_DIR/backend && source .venv/bin/activate && PYTHONPATH=$APP_DIR/backend alembic upgrade head"

info "Building frontend..."
sudo -u deploy bash -c "cd $APP_DIR/frontend && npm install --silent && npm run build"

info "Installing systemd services..."
cp "$APP_DIR/deploy/uvicorn.service"            /etc/systemd/system/
cp "$APP_DIR/deploy/dramatiq-worker.service"    /etc/systemd/system/
cp "$APP_DIR/deploy/dramatiq-scheduler.service" /etc/systemd/system/
cp "$APP_DIR/deploy/upload-processor.service"   /etc/systemd/system/
systemctl daemon-reload

info "Restarting services..."
systemctl enable upload-processor 2>/dev/null || true
systemctl restart uvicorn dramatiq-worker dramatiq-scheduler upload-processor

echo ""
echo "──────────────────────────────────────"
systemctl is-active uvicorn && echo -e "  ${GREEN}✓${NC} uvicorn" || echo -e "  ${RED}✗${NC} uvicorn"
systemctl is-active dramatiq-worker && echo -e "  ${GREEN}✓${NC} dramatiq-worker" || echo -e "  ${RED}✗${NC} dramatiq-worker"
systemctl is-active dramatiq-scheduler && echo -e "  ${GREEN}✓${NC} dramatiq-scheduler" || echo -e "  ${RED}✗${NC} dramatiq-scheduler"
systemctl is-active upload-processor && echo -e "  ${GREEN}✓${NC} upload-processor" || echo -e "  ${RED}✗${NC} upload-processor"
echo "──────────────────────────────────────"
echo -e "  ${GREEN}Deploy complete!${NC}"
echo ""
