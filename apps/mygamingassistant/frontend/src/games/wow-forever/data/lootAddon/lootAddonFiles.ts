import addonData from "../../../../../addon/MGALoot/Data.lua?raw";
import addonLua from "../../../../../addon/MGALoot/MGALoot.lua?raw";
import addonToc from "../../../../../addon/MGALoot/MGALoot.toc?raw";

/** The MGA Loot addon's folder in the download: `Interface\AddOns\MGALoot`. */
export const LOOT_ADDON_FOLDER = "MGALoot";

export const LOOT_ADDON_ZIP_NAME = "MGALoot.zip";

/** The addon's files, from `apps/mygamingassistant/frontend/addon/MGALoot` (`Data.lua` is generated from Item compare's weights). */
export const LOOT_ADDON_FILES: Readonly<Record<string, string>> = {
  "MGALoot.toc": addonToc,
  "Data.lua": addonData,
  "MGALoot.lua": addonLua,
};
