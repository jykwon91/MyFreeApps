#!/usr/bin/env bash
# Wait for every GitHub Actions run on a commit (deploys after a merge) to
# finish. Exits 1 and names the runs that didn't succeed.
#
#   scripts/agent/wait-runs.sh <sha | pr number> [--workflow <name substring>] [--timeout-min N]
set -euo pipefail

ref="${1:?usage: wait-runs.sh <sha | pr number> [--workflow NAME] [--timeout-min N]}"
shift
workflow=""
timeout_min=60
while [ $# -gt 0 ]; do
  case "$1" in
    --workflow) workflow="$2"; shift ;;
    --timeout-min) timeout_min="$2"; shift ;;
    *) echo "unknown option $1" >&2; exit 64 ;;
  esac
  shift
done

if [[ "$ref" =~ ^[0-9]+$ ]]; then
  sha="$(gh pr view "$ref" --json mergeCommit --jq '.mergeCommit.oid')"
  [ -n "$sha" ] && [ "$sha" != "null" ] || { echo "PR #$ref isn't merged" >&2; exit 1; }
else
  sha="$ref"
fi

deadline=$(( $(date +%s) + timeout_min * 60 ))
seen=0
while :; do
  runs="$(gh run list --commit "$sha" --limit 50 --json workflowName,status,conclusion,url \
    --jq '.[] | "\(.status)\t\(.conclusion)\t\(.workflowName)\t\(.url)"' 2>/dev/null || true)"
  [ -z "$workflow" ] || runs="$(printf '%s\n' "$runs" | awk -F'\t' -v w="$workflow" 'index($3, w)')"
  if [ -n "$runs" ]; then
    seen=1
    open="$(printf '%s\n' "$runs" | awk -F'\t' '$1!="completed"' | wc -l | tr -d ' ')"
    if [ "$open" = "0" ]; then
      bad="$(printf '%s\n' "$runs" | awk -F'\t' '$2!="success" && $2!="skipped" {print "  " $2 ": " $3 " " $4}')"
      printf '%s\n' "$runs" | awk -F'\t' '{print $2 "\t" $3}'
      [ -z "$bad" ] || { echo "runs that didn't succeed:"; echo "$bad"; exit 1; }
      exit 0
    fi
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    [ "$seen" = 1 ] && echo "runs on $sha still going after ${timeout_min}m" >&2 || echo "no runs started for $sha" >&2
    exit 2
  fi
  sleep 30
done
