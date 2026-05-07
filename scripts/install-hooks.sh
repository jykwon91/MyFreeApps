#!/usr/bin/env bash
# One-time setup so git uses the in-repo hooks under .githooks/.
# Run after every fresh clone: `bash scripts/install-hooks.sh`
#
# This points git at the repo's .githooks directory instead of the
# default .git/hooks. The hooks are versioned with the rest of the code
# so they update automatically with every pull — no per-developer drift.

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

git config core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null || true

echo "✓ git hooks installed (core.hooksPath = .githooks)"
echo "  Bypass any hook with --no-verify if you need to."
