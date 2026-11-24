#!/usr/bin/env bash
# Remove a worktree made by worktree-new.sh: unlink its node_modules links (the
# link only, never the main checkout's folder), then remove the worktree and,
# when it's merged into origin/main or its PR is merged, the local branch.
#
#   scripts/agent/worktree-remove.sh <name or path>
set -euo pipefail

arg="${1:?usage: worktree-remove.sh <name or path>}"
main="$(git rev-parse --path-format=absolute --git-common-dir)/.."
main="$(cd "$main" && pwd)"
if [ -d "$arg" ]; then dest="$(cd "$arg" && pwd)"; else dest="$(dirname "$main")/$(basename "$main")-worktrees/$arg"; fi
[ -d "$dest" ] || { echo "no worktree at $dest" >&2; exit 1; }
branch="$(git -C "$dest" branch --show-current)"

unlink_nm() {
  if [ -n "${WINDIR:-}" ]; then
    # rmdir on a junction removes the junction, not what it points at.
    MSYS2_ARG_CONV_EXCL="*" cmd /c rmdir "$(cygpath -w "$1")"
  else
    unlink "$1"
  fi
}

for nm in "$dest"/node_modules "$dest"/packages/*/node_modules "$dest"/apps/*/*/node_modules; do
  if [ -L "$nm" ] || { [ -n "${WINDIR:-}" ] && [ -d "$nm" ] && fsutil reparsepoint query "$(cygpath -w "$nm")" >/dev/null 2>&1; }; then
    unlink_nm "$nm"
  fi
done

git -C "$main" worktree remove -f -f "$dest"
git -C "$main" worktree prune

[ -n "$branch" ] || exit 0
merged="$(gh pr list --head "$branch" --state merged --json number --jq 'length' 2>/dev/null || echo 0)"
if [ "$merged" != "0" ] || git -C "$main" merge-base --is-ancestor "$branch" origin/main 2>/dev/null; then
  git -C "$main" branch -D "$branch" >/dev/null && echo "deleted branch $branch"
else
  echo "kept branch $branch (not merged)"
fi
