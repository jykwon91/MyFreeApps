import addonCore from "../../../../../addon/MGAPvPLog/Core.lua?raw";
import addonLua from "../../../../../addon/MGAPvPLog/MGAPvPLog.lua?raw";
import addonToc from "../../../../../addon/MGAPvPLog/MGAPvPLog.toc?raw";
import addonTrack from "../../../../../addon/MGAPvPLog/Track.lua?raw";
import addonWindow from "../../../../../addon/MGAPvPLog/Window.lua?raw";

/** The MGA PvP Log addon's folder in the download: `Interface\AddOns\MGAPvPLog`. */
export const PVPLOG_ADDON_FOLDER = "MGAPvPLog";

export const PVPLOG_ADDON_ZIP_NAME = "MGAPvPLog.zip";

/** The addon's files, from `apps/mygamingassistant/frontend/addon/MGAPvPLog`. */
export const PVPLOG_ADDON_FILES: Readonly<Record<string, string>> = {
  "MGAPvPLog.toc": addonToc,
  "Core.lua": addonCore,
  "Track.lua": addonTrack,
  "Window.lua": addonWindow,
  "MGAPvPLog.lua": addonLua,
};
