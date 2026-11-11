# MGA Prices updater

Keeps the MGA Prices addon's `Data.lua` current without re-downloading the addon.
Addons can't go online, so this small Node program fetches the live prices
(`GET /api/wow/prices`, every house) and rewrites `Interface\AddOns\MGAPrices\Data.lua`
with the same builder the site's "Download the addon" button uses (`addonPriceLua`).
The game reads `Data.lua` only at login or `/reload`.

It writes only `Data.lua`. Addon code changes still arrive by downloading the addon.

## Build and install (Windows, Node 22+)

```powershell
cd apps/mygamingassistant/frontend
npm run build:prices-updater          # -> dist-updater/mga-prices-updater.mjs (recipe data bundled in)
.\updater\install-prices-updater.ps1 -AddOnsPath "D:\World of Warcraft\_forever_\Interface\AddOns"
```

The installer copies the updater to `%LOCALAPPDATA%\MGAPrices\`, runs it once, and
registers the scheduled task **MGA Prices updater** (hourly, no window, via
`conhost --headless`). Each run appends one line to `%LOCALAPPDATA%\MGAPrices\updater.log`.
Re-run both commands after the recipe data or `addonPriceLua` changes.

Remove: `Unregister-ScheduledTask -TaskName "MGA Prices updater" -Confirm:$false`,
then delete `%LOCALAPPDATA%\MGAPrices`.
