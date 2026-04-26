#!/usr/bin/env bash
#
# sync-public.sh — export HEAD of the private repo as a single-commit snapshot
# to the MyBookkeeper-public repo on GitHub.
#
# What it does:
#   1. Confirms we're on main and the tree is clean.
#   2. Exports HEAD into a staging dir (no git history).
#   3. Removes paths that must never reach public (private hooks, tech-debt
#      tracker, any .env file, assistant internals).
#   4. Overlays scripts/public-assets/ (README, LICENSE) onto the staging dir.
#   5. Force-pushes a fresh single-commit branch to MyBookkeeper-public:main.
#
# The public repo is a code sample, not a fork — history is intentionally
# discarded every sync. Do NOT expect `git log` continuity between syncs.
#
# Usage:
#   bash scripts/sync-public.sh              # dry run, shows what would ship
#   bash scripts/sync-public.sh --push       # actually force-push
#
set -euo pipefail

PUBLIC_REMOTE="git@github.com:jykwon91/MyBookkeeper-public.git"
PUBLIC_REMOTE_HTTPS="https://github.com/jykwon91/MyBookkeeper-public.git"
STAGING_DIR="${TMPDIR:-/tmp}/mybookkeeper-public-sync-$$"
REPO_ROOT="$(git rev-parse --show-toplevel)"
DO_PUSH=0

if [[ "${1:-}" == "--push" ]]; then DO_PUSH=1; fi

BRANCH="$(git -C "$REPO_ROOT" branch --show-current)"
if [[ "$BRANCH" != "main" ]]; then
  echo "error: sync must run from main (current: $BRANCH)" >&2
  exit 1
fi

if ! git -C "$REPO_ROOT" diff-index --quiet HEAD --; then
  echo "error: working tree is dirty — commit or stash first" >&2
  exit 1
fi

git -C "$REPO_ROOT" fetch origin main --quiet
LOCAL=$(git -C "$REPO_ROOT" rev-parse main)
REMOTE=$(git -C "$REPO_ROOT" rev-parse origin/main)
if [[ "$LOCAL" != "$REMOTE" ]]; then
  echo "error: local main is not in sync with origin/main" >&2
  exit 1
fi

echo "→ staging HEAD into $STAGING_DIR"
mkdir -p "$STAGING_DIR"
git -C "$REPO_ROOT" archive HEAD | tar -x -C "$STAGING_DIR"

echo "→ removing paths that must not ship public"
EXCLUDE_PATHS=(
  ".claude"
  "TECH_DEBT.md"
  "frontend/.env"
  "backend/.env"
)
for p in "${EXCLUDE_PATHS[@]}"; do
  if [[ -e "$STAGING_DIR/$p" ]]; then
    rm -rf "$STAGING_DIR/$p"
    echo "   removed $p"
  fi
done

# Defensive scan — anything .env under the staging tree should not be there.
STRAYS=$(find "$STAGING_DIR" -name ".env" -not -name ".env.example" -not -name ".env.docker.example" 2>/dev/null || true)
if [[ -n "$STRAYS" ]]; then
  echo "error: unexpected .env files found in staging:" >&2
  echo "$STRAYS" >&2
  exit 1
fi

echo "→ overlaying public-assets (README, LICENSE)"
cp "$REPO_ROOT/scripts/public-assets/README.md" "$STAGING_DIR/README.md"
cp "$REPO_ROOT/scripts/public-assets/LICENSE" "$STAGING_DIR/LICENSE"

SHA=$(git -C "$REPO_ROOT" rev-parse --short HEAD)
SUBJECT=$(git -C "$REPO_ROOT" log -1 --format="%s")

echo "→ initializing snapshot repo"
cd "$STAGING_DIR"
git init -b main --quiet
git add .
git -c user.email="$(git -C "$REPO_ROOT" config user.email)" \
    -c user.name="$(git -C "$REPO_ROOT" config user.name)" \
    commit --quiet -m "Public snapshot @ ${SHA}

Latest private commit: ${SUBJECT}

This is a single-commit snapshot of the MyBookkeeper private repository
for portfolio / code-sample purposes. History is rewritten on every sync."

if [[ "$DO_PUSH" -eq 0 ]]; then
  echo ""
  echo "dry run — staging left at: $STAGING_DIR"
  echo "re-run with --push to force-push to $PUBLIC_REMOTE_HTTPS"
  exit 0
fi

echo "→ force-pushing to $PUBLIC_REMOTE"
git remote add origin "$PUBLIC_REMOTE" 2>/dev/null || git remote set-url origin "$PUBLIC_REMOTE"
if ! git push --force origin main 2>/dev/null; then
  echo "   SSH push failed, retrying over HTTPS"
  git remote set-url origin "$PUBLIC_REMOTE_HTTPS"
  git push --force origin main
fi

echo ""
echo "✓ MyBookkeeper-public now matches private $SHA"
echo "  staging kept at: $STAGING_DIR (safe to delete)"
