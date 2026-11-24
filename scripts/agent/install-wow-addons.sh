#!/usr/bin/env bash
# Install the MGA WoW addons from a git ref (default origin/main) into the
# game's AddOns folder. Writes only files that differ, never deletes, and keeps
# the installed MGAPrices/Data.lua (the hourly updater owns it). Says whether a
# /reload is enough or the game needs a full restart (a new .toc).
#
#   scripts/agent/install-wow-addons.sh [Addon ...]        (default: every addon)
#   WOW_ADDONS=<AddOns dir>  REF=<git ref>  to override.
set -euo pipefail

addons_dir="${WOW_ADDONS:-/d/World of Warcraft/_forever_/Interface/AddOns}"
ref="${REF:-origin/main}"
src="apps/mygamingassistant/frontend/addon"
root="$(git rev-parse --show-toplevel)"
[ -d "$addons_dir" ] || { echo "no AddOns folder at $addons_dir" >&2; exit 1; }
[ "$ref" != "origin/main" ] || git -C "$root" fetch -q origin main

if [ $# -gt 0 ]; then
  names=("$@")
else
  names=()
  while IFS= read -r p; do names+=("${p##*/}"); done < <(git -C "$root" ls-tree --name-only "$ref" "$src/")
fi

changed=0
restart=0
for a in "${names[@]}"; do
  files="$(git -C "$root" ls-tree --name-only "$ref" "$src/$a/" | sed "s|.*/||")"
  # Only a folder with a .toc is an addon; addon/shared is source copied into each one.
  printf '%s\n' "$files" | grep -q '\.toc$' || continue
  mkdir -p "$addons_dir/$a"
  for f in $files; do
    [ "$a/$f" != "MGAPrices/Data.lua" ] || continue
    dest="$addons_dir/$a/$f"
    if [ -f "$dest" ] && git -C "$root" show "$ref:$src/$a/$f" | cmp -s - "$dest"; then continue; fi
    case "$f" in *.toc) [ -f "$dest" ] || restart=1 ;; esac
    git -C "$root" show "$ref:$src/$a/$f" > "$dest"
    echo "updated $a/$f"
    changed=$((changed + 1))
  done
done

if [ "$changed" = 0 ]; then echo "addons already up to date"
elif [ "$restart" = 1 ]; then echo "$changed files updated; a new .toc means a full game restart"
else echo "$changed files updated; /reload in game"
fi
