#!/usr/bin/env bash
# Create a worktree for one PR, branched from fresh origin/main, with the main
# checkout's node_modules linked in so vitest/tsc run without an `npm ci`.
#
#   scripts/agent/worktree-new.sh <name> [branch]     (branch defaults to feature/<name>)
#
# Prints the worktree path on the last line. Remove it with worktree-remove.sh,
# which unlinks node_modules first so the main checkout's copy is never touched.
set -euo pipefail

name="${1:?usage: worktree-new.sh <name> [branch]}"
branch="${2:-feature/$name}"
main="$(git rev-parse --path-format=absolute --git-common-dir)/.."
main="$(cd "$main" && pwd)"
dest="$(dirname "$main")/$(basename "$main")-worktrees/$name"

git -C "$main" fetch -q origin main
git -C "$main" worktree add -q -b "$branch" "$dest" origin/main
[ "$(git -C "$dest" branch --show-current)" = "$branch" ] || { echo "worktree is not on $branch" >&2; exit 1; }

link() {
  if [ -n "${WINDIR:-}" ]; then
    # Without the exclusion MSYS rewrites /J into a path.
    MSYS2_ARG_CONV_EXCL="*" cmd /c mklink /J "$(cygpath -w "$2")" "$(cygpath -w "$1")" >/dev/null
  else
    ln -s "$1" "$2"
  fi
}

# Every node_modules in the main checkout that sits next to a package.json.
for nm in "$main"/node_modules "$main"/packages/*/node_modules "$main"/apps/*/*/node_modules; do
  [ -d "$nm" ] || continue
  rel="${nm#"$main"/}"
  target="$dest/$rel"
  [ -e "$target" ] || [ ! -d "$(dirname "$target")" ] || link "$nm" "$target"
done

echo "$dest"
