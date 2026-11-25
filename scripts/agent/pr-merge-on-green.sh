#!/usr/bin/env bash
# Wait for every check on a PR to finish, then squash-merge it with --admin
# only if none failed and every required check on main (branch protection, e.g.
# `ci-gate`) has reported pass or skipped. --admin bypasses GitHub's own
# required-check rule, so this script enforces it instead. Never uses --auto.
# Exits 1 and lists the failures when a check fails, 2 on timeout, 3 when the
# required checks can't be read. Polling here costs no tokens; an agent polling
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

repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
base="$(gh pr view "$pr" --json baseRefName --jq .baseRefName)"
if ! required="$(gh api "repos/$repo/branches/$base/protection/required_status_checks" --jq '.contexts[]' 2>/dev/null)"; then
  echo "PR #$pr: can't read the required checks on $base; not merging" >&2
  exit 3
fi

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
    missing=""
    while IFS= read -r ctx; do
      [ -n "$ctx" ] || continue
      printf '%s
' "$checks" | awk -F'	' -v c="$ctx" '$2==c && ($1=="pass" || $1=="skipping") {ok=1} END {exit !ok}' || missing="$missing $ctx"
    done <<< "$required"
    [ "$pending" = "0" ] && [ -z "$missing" ] && break
  fi
  [ "$(date +%s)" -lt "$deadline" ] || { echo "PR #$pr: checks still pending after ${timeout_min}m${missing:+ (required check not reported:$missing)}" >&2; exit 2; }
  sleep 30
done

echo "PR #$pr: all checks green"
[ "$merge" = 1 ] || exit 0
gh pr merge "$pr" --squash --admin
sha="$(gh pr view "$pr" --json mergeCommit --jq '.mergeCommit.oid')"
echo "merged PR #$pr as $sha"
