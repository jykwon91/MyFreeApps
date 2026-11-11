# Installs the MGA Prices updater: copies the built updater to %LOCALAPPDATA%\MGAPrices,
# runs it once, and registers an hourly scheduled task (no window) that rewrites the
# addon's Data.lua with the live prices. Run `npm run build:prices-updater` first.
#
#   .\updater\install-prices-updater.ps1 -AddOnsPath "D:\World of Warcraft\_forever_\Interface\AddOns"
#
# Remove:  Unregister-ScheduledTask -TaskName "MGA Prices updater" -Confirm:$false
param(
  [Parameter(Mandatory = $true)][string]$AddOnsPath
)
$ErrorActionPreference = "Stop"

$TaskName = "MGA Prices updater"
$built = Join-Path $PSScriptRoot "..\dist-updater\mga-prices-updater.mjs"
$installDir = Join-Path $env:LOCALAPPDATA "MGAPrices"
$updater = Join-Path $installDir "mga-prices-updater.mjs"

if (-not (Test-Path $built)) { throw "Build it first: npm run build:prices-updater" }
if (-not (Test-Path (Join-Path $AddOnsPath "MGAPrices"))) { throw "MGA Prices isn't installed in $AddOnsPath" }
$node = (Get-Command node -ErrorAction Stop).Source

New-Item -ItemType Directory -Force $installDir | Out-Null
Copy-Item $built $updater -Force

& $node $updater $AddOnsPath
if ($LASTEXITCODE -ne 0) { throw "The first update failed; see $installDir\updater.log" }

# conhost --headless runs the console app with no window, so nothing flashes over the game.
$action = New-ScheduledTaskAction -Execute "conhost.exe" -Argument "--headless `"$node`" `"$updater`" `"$AddOnsPath`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Description "Rewrites MGA Prices' Data.lua with live auction-house prices every hour. Log: $installDir\updater.log" -Force | Out-Null

Write-Output "Installed. '$TaskName' runs every hour; log: $installDir\updater.log"
