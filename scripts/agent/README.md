# Agent helpers

Fixed procedures that sessions and subagents used to run by hand, one tool call
at a time. Run the script instead: waiting and copying cost no tokens here.
Brief an agent with "run `scripts/agent/<script>`", not with the steps.

| Script | Does |
|---|---|
| `worktree-new.sh <name> [branch]` | Worktree from fresh `origin/main` in `../MyFreeApps-worktrees/<name>`, with the main checkout's `node_modules` linked in (vitest/tsc work without `npm ci`). Prints the path. |
| `worktree-remove.sh <name or path>` | Unlinks those `node_modules` links (never the real folders), removes the worktree, deletes the branch if it's merged. |
| `pr-merge-on-green.sh <pr> [--no-merge]` | Waits until no check is pending and every required check on the base branch (`ci-gate`) has passed or been skipped, since `--admin` would bypass that rule; on any failure lists it and exits 1; otherwise `gh pr merge --squash --admin` (never `--auto`). |
| `wait-runs.sh <pr or sha> [--workflow NAME]` | Waits for every Actions run on the merge commit (the deploys) and exits 1 naming any that didn't succeed. |
| `install-wow-addons.sh [Addon ...]` | Copies the MGA WoW addons from `origin/main` into the game's AddOns folder: only changed files, deletes only files the repo once shipped in that folder and has since removed, keeps the installed `MGAPrices/Data.lua`, says `/reload` or full restart. `WOW_ADDONS`, `REF` override. |

Typical PR: `worktree-new.sh x` → edit, test, commit, push, `gh pr create` →
`pr-merge-on-green.sh N` → `wait-runs.sh N` → verify live → `worktree-remove.sh x`.

Run them in the background (`run_in_background`) when the wait is long; the
exit code is the answer.
