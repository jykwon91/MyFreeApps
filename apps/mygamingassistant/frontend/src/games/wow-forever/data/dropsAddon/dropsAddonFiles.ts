import addonCore from "../../../../../addon/MGADrops/Core.lua?raw";
import addonData from "../../../../../addon/MGADrops/Data.lua?raw";
import addonLicense from "../../../../../addon/MGADrops/LICENSE?raw";
import addonLua from "../../../../../addon/MGADrops/MGADrops.lua?raw";
import addonToc from "../../../../../addon/MGADrops/MGADrops.toc?raw";
import addonWindow from "../../../../../addon/MGADrops/Window.lua?raw";

/** The MGA Drops addon's folder in the download: `Interface\AddOns\MGADrops`. */
export const DROPS_ADDON_FOLDER = "MGADrops";

/**
 * The addon's files, from `apps/mygamingassistant/frontend/addon/MGADrops`. `Data.lua` (about 1 MB) is written by
 * `python -m scripts.wow_mob_drops.build`; it's cmangos classic-db data, so the GPL `LICENSE` ships beside it.
 * Only ever imported dynamically (see loadDropsAddonZip), so the page doesn't carry the data.
 */
export const DROPS_ADDON_FILES: Readonly<Record<string, string>> = {
  "MGADrops.toc": addonToc,
  "Data.lua": addonData,
  "Core.lua": addonCore,
  "Window.lua": addonWindow,
  "MGADrops.lua": addonLua,
  LICENSE: addonLicense,
};
