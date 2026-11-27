import addonLua from "../../../../../addon/MGABuffs/MGABuffs.lua?raw";
import addonToc from "../../../../../addon/MGABuffs/MGABuffs.toc?raw";

/** The MGA Buffs addon's folder in the download: `Interface\AddOns\MGABuffs`. */
export const BUFFS_ADDON_FOLDER = "MGABuffs";

export const BUFFS_ADDON_ZIP_NAME = "MGABuffs.zip";

/** The addon's files, from `apps/mygamingassistant/frontend/addon/MGABuffs`. */
export const BUFFS_ADDON_FILES: Readonly<Record<string, string>> = {
  "MGABuffs.toc": addonToc,
  "MGABuffs.lua": addonLua,
};
