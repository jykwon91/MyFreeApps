#!/usr/bin/env bash
# Wait for every check on a PR to finish, then squash-merge it with --admin
# only if none failed. Never uses --auto. Exits 1 and lists the failures when a
# check fails, 2 on timeout. Polling here costs no tokens; an agent polling
# `gh pr checks` itself pays for every look.
#
#   scripts/agent/pr-merge-on-green.sh <pr> [--no-merge] [--timeout-min N]
set -euo pipefail

pr="${1:?usage: pr-merge-on-green.sh <pr> [--no-merge] [--timeout-min N]}"
shift
merge=1
timeout_min=90
while [ $# -gt 0 ]; do
  case "$1" in
    --no-merge) merge=0 ;;
    --timeout-min) timeout_min="$2"; shift ;;
    *) echo "unknown option $1" >&2; exit 64 ;;
  esac
  shift
done

deadline=$(( $(date +%s) + timeout_min * 60 ))
while :; do
  # Buckets: pass, fail, pending, skipping, cancel.
  checks="$(gh pr checks "$pr" --json bucket,name --jq '.[] | "\(.bucket)\t\(.name)"' 2>/dev/null || true)"
  if [ -n "$checks" ]; then
    failed="$(printf '%s\n' "$checks" | awk -F'\t' '$1=="fail" || $1=="cancel" {print "  " $2}')"
    pending="$(printf '%s\n' "$checks" | awk -F'\t' '$1=="pending"' | wc -l | tr -d ' ')"
    if [ -n "$failed" ]; then
      echo "PR #$pr has failing checks:"
      echo "$failed"
      exit 1
    fi
    [ "$pending" = "0" ] && break
  fi
  [ "$(date +%s)" -lt "$deadline" ] || { echo "PR #$pr: checks still pending after ${timeout_min}m" >&2; exit 2; }
  sleep 30
done

echo "PR #$pr: all checks green"
[ "$merge" = 1 ] || exit 0
gh pr merge "$pr" --squash --admin
sha="$(gh pr view "$pr" --json mergeCommit --jq '.mergeCommit.oid')"
echo "merged PR #$pr as $sha"
