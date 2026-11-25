import addonBindings from "../../../../../addon/MGAPvPLog/Bindings.xml?raw";
import addonCore from "../../../../../addon/MGAPvPLog/Core.lua?raw";
import addonHub from "../../../../../addon/MGAPvPLog/MGAHub.lua?raw";
import addonLua from "../../../../../addon/MGAPvPLog/MGAPvPLog.lua?raw";
import addonToc from "../../../../../addon/MGAPvPLog/MGAPvPLog.toc?raw";
import addonWindow from "../../../../../addon/MGAPvPLog/Window.lua?raw";

/** The MGA PvP Log addon's folder in the download: `Interface\AddOns\MGAPvPLog`. */
export const PVPLOG_ADDON_FOLDER = "MGAPvPLog";

export const PVPLOG_ADDON_ZIP_NAME = "MGAPvPLog.zip";

/** The addon's files, from `apps/mygamingassistant/frontend/addon/MGAPvPLog`. */
export const PVPLOG_ADDON_FILES: Readonly<Record<string, string>> = {
  "MGAPvPLog.toc": addonToc,
  "MGAHub.lua": addonHub,
  "Bindings.xml": addonBindings,
  "Core.lua": addonCore,
  "Window.lua": addonWindow,
  "MGAPvPLog.lua": addonLua,
};
