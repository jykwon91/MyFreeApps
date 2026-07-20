#Requires -Version 5
<#
.SYNOPSIS
  Ship a MyGamingAssistant lineup-library update to production in one command.

.DESCRIPTION
  The LOCAL half of the "merge a library update -> it goes live" automation.
  Runs on the authoring box (where the recut clip bytes live in local MinIO).
  In order:

    1. export_lineup_pack.py   -> regenerate backend/data/lineup_library.json
    2. publish_clips_to_r2.py  -> push every referenced clip byte to Cloudflare R2
    3. git: branch off latest origin/main + commit the regenerated pack + push
    4. gh:  open a PR, wait for CI to pass, admin-squash-merge on green

  Once merged, the MGA deploy workflow runs load-fixtures + import-lineups in
  the prod container automatically (apps/mygamingassistant/app.yaml
  post_deploy_commands), so prod reconciles to the new pack with NO manual VPS
  step. Clips were already pushed to R2 in step 2, so they render immediately.

  R2 credentials are read from scripts/.env.r2 (gitignored). Copy
  scripts/.env.r2.example -> scripts/.env.r2 and fill it in once.

  Preconditions: local Postgres (:5433) + standalone MinIO (:9000) up, the
  library accepted, and gh authenticated as a repo admin.

.PARAMETER Message
  Commit message / PR title. Required unless -DryRun.

.PARAMETER DryRun
  Export + preview the R2 publish (no upload) + show the pack diff, then restore.
  Touches nothing in git and opens no PR.

.EXAMPLE
  .\scripts\ship-library.ps1 -Message "Add 19 Cache (de_cache) smoke lineups"

.EXAMPLE
  .\scripts\ship-library.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [string]$Message,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }
function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

if (-not $DryRun -and [string]::IsNullOrWhiteSpace($Message)) {
    Fail "-Message is required (commit message / PR title). Use -DryRun to preview."
}

# --- Paths ---------------------------------------------------------------
$ScriptDir  = $PSScriptRoot
$BackendDir = Split-Path -Parent $ScriptDir
$VenvPy     = Join-Path $BackendDir ".venv\Scripts\python.exe"
$ExportPy   = Join-Path $ScriptDir  "export_lineup_pack.py"
$PublishPy  = Join-Path $ScriptDir  "publish_clips_to_r2.py"
$EnvR2      = Join-Path $ScriptDir  ".env.r2"
$PackRel    = "apps/mygamingassistant/backend/data/lineup_library.json"

foreach ($p in @($VenvPy, $ExportPy, $PublishPy)) {
    if (-not (Test-Path $p)) { Fail "Missing required file: $p" }
}
if (-not (Test-Path $EnvR2)) {
    Fail "Missing $EnvR2 -- copy scripts/.env.r2.example to scripts/.env.r2 and fill in your R2 creds."
}

# NOTE: never redirect native stderr (2>$null) under PS 5.1 -- it wraps git's
# normal stderr (e.g. "Switched to branch") as a fatal NativeCommandError.
# Rely on $LASTEXITCODE instead and let git's informational stderr just print.
$RepoRoot = (& git -C $BackendDir rev-parse --show-toplevel)
if ($LASTEXITCODE -ne 0) { Fail "Not a git repository: $BackendDir" }
$RepoRoot = $RepoRoot.Trim()
$OrigBranch = (& git -C $RepoRoot branch --show-current).Trim()

# --- Refuse if the tree has unrelated tracked changes --------------------
# Only the pack may differ; untracked files (scripts/, frame studies) are fine.
$tracked = & git -C $RepoRoot status --porcelain | Where-Object { $_ -notmatch '^\?\?' }
$unexpected = $tracked | Where-Object { $_ -notmatch [regex]::Escape($PackRel) }
if ($unexpected) {
    Write-Host "Refusing: working tree has tracked changes other than the lineup pack:" -ForegroundColor Red
    $unexpected | ForEach-Object { Write-Host "  $_" }
    Fail "Commit or set aside that work first -- this tool only ships the lineup pack."
}

# --- Load R2 creds from .env.r2 (KEY=VALUE per line) ---------------------
Get-Content $EnvR2 | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) { return }
    $kv = $line -split '=', 2
    if ($kv.Count -eq 2) {
        $name = $kv[0].Trim()
        $val  = $kv[1].Trim().Trim('"').Trim("'")
        if ($name) { Set-Item -Path "Env:$name" -Value $val }
    }
}

# --- DRY RUN: export + preview, mutate nothing ---------------------------
if ($DryRun) {
    Step "Export lineup pack (dry run)"
    & $VenvPy $ExportPy
    if ($LASTEXITCODE -ne 0) { Fail "export_lineup_pack.py failed (is local Postgres up?)" }

    Step "Publish preview (no upload)"
    & $VenvPy $PublishPy --dry-run
    $pubExit = $LASTEXITCODE   # 1 just means 'some keys missing locally' in dry-run

    Step "Pack diff (NOT committed)"
    & git -C $RepoRoot --no-pager diff -- $PackRel
    & git -C $RepoRoot checkout -- $PackRel   # restore: dry run leaves no trace
    if ($pubExit -ne 0) {
        Write-Host "`nDry run done, but the publish preview flagged missing clips -- regenerate via backfill-* before a real ship." -ForegroundColor Yellow
    } else {
        Write-Host "`nDry run complete. Re-run with -Message '...' to ship." -ForegroundColor Green
    }
    exit 0
}

# --- Branch off the LATEST origin/main -----------------------------------
$Branch = "feature/mga-library-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Step "Branch off origin/main -> $Branch"
& git -C $RepoRoot fetch origin --quiet
if ($LASTEXITCODE -ne 0) { Fail "git fetch failed" }
& git -C $RepoRoot checkout -b $Branch origin/main
if ($LASTEXITCODE -ne 0) { Fail "could not create branch $Branch off origin/main" }

# --- Export the pack -----------------------------------------------------
Step "Export lineup pack"
& $VenvPy $ExportPy
if ($LASTEXITCODE -ne 0) {
    & git -C $RepoRoot checkout $OrigBranch
    & git -C $RepoRoot branch -D $Branch
    Fail "export_lineup_pack.py failed (is local Postgres up?)"
}

# --- Publish clip bytes to R2 (real) -------------------------------------
# Runs ALWAYS (before the no-change check) so clips stay in sync even when the
# pack itself is unchanged: catch-up (pack already merged, clips never pushed)
# and recovery (a prior ship committed the pack but its upload failed).
Step "Publish clips to R2"
& $VenvPy $PublishPy
if ($LASTEXITCODE -ne 0) {
    Write-Host "publish_clips_to_r2.py reported missing clips (exit $LASTEXITCODE)." -ForegroundColor Red
    Write-Host "Regenerate via the backfill-* CLI, then re-run. Branch $Branch kept." -ForegroundColor Yellow
    Fail "Aborting before commit -- fix the missing clips first."
}

# --- Nothing changed? clips are now synced; bail cleanly -----------------
& git -C $RepoRoot diff --quiet -- $PackRel
if ($LASTEXITCODE -eq 0) {
    & git -C $RepoRoot checkout $OrigBranch
    & git -C $RepoRoot branch -D $Branch
    Write-Host "`nClips synced to R2. Pack unchanged since origin/main -- nothing to commit." -ForegroundColor Green
    exit 0
}

# --- Commit + push -------------------------------------------------------
Step "Commit + push"
& git -C $RepoRoot add -- $PackRel
& git -C $RepoRoot commit -m $Message
if ($LASTEXITCODE -ne 0) { Fail "git commit failed" }
& git -C $RepoRoot push -u origin $Branch
if ($LASTEXITCODE -ne 0) { Fail "git push failed" }

# --- Open PR -------------------------------------------------------------
$Body = @(
    "Regenerated lineup pack ($PackRel) and published the referenced clip bytes to R2."
    ""
    "Shipped via scripts/ship-library.ps1. On merge, the MyGamingAssistant deploy"
    "workflow runs load-fixtures + import-lineups in-container automatically"
    "(apps/mygamingassistant/app.yaml post_deploy_commands), reconciling prod to this pack."
    "Clips were pushed to R2 before this PR, so they render immediately."
) -join "`n"
Step "Open PR"
& gh pr create --repo $RepoRoot --base main --head $Branch --title $Message --body $Body
if ($LASTEXITCODE -ne 0) { Fail "gh pr create failed -- branch $Branch is pushed; open the PR manually." }
$PrUrl = (& gh pr view $Branch --repo $RepoRoot --json url --jq '.url').Trim()
Write-Host "PR: $PrUrl"

# --- Wait for CI, then admin-squash-merge on green -----------------------
# main requires status checks AND a review; the operator uses admin-merge
# (blanket approval) rather than reviewing. So: wait for green, then --admin
# (bypasses the required-review + strict-up-to-date gates, like a manual merge).
Step "Waiting for CI to pass (several minutes -- safe to leave running)"
& gh pr checks $Branch --repo $RepoRoot --watch --fail-fast
if ($LASTEXITCODE -ne 0) { Fail "CI did not pass -- PR left open for inspection: $PrUrl" }

Step "Merge (admin squash) + delete branch"
& gh pr merge $Branch --repo $RepoRoot --admin --squash --delete-branch
if ($LASTEXITCODE -ne 0) { Fail "merge failed -- check $PrUrl" }

Write-Host "`nShipped. The deploy workflow will load-fixtures + import-lineups on prod automatically." -ForegroundColor Green
Write-Host "Verify in a few minutes: curl https://mygamingassistant.myfreeapps.org/api/lineups" -ForegroundColor Green
