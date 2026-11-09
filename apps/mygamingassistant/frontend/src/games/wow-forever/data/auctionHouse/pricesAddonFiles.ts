import addonLua from "../../../../../addon/MGAPrices/MGAPrices.lua?raw";
import addonToc from "../../../../../addon/MGAPrices/MGAPrices.toc?raw";

/** The MGA Prices addon's folder in the download: `Interface\AddOns\MGAPrices`. */
export const PRICES_ADDON_FOLDER = "MGAPrices";

export const PRICES_ADDON_ZIP_NAME = "MGAPrices.zip";

/** The file the download fills with prices (`addon/MGAPrices/Data.lua` in the repo is an empty stand-in). */
export const PRICES_ADDON_DATA_FILE = "Data.lua";

/** The addon's own files, from `apps/mygamingassistant/frontend/addon/MGAPrices`. */
export const PRICES_ADDON_FILES: Readonly<Record<string, string>> = {
  "MGAPrices.toc": addonToc,
  "MGAPrices.lua": addonLua,
};
