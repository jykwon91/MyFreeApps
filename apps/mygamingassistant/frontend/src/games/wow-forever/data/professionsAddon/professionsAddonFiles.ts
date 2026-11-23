import addonBindings from "../../../../../addon/MGAProfessions/Bindings.xml?raw";
import addonCore from "../../../../../addon/MGAProfessions/Core.lua?raw";
import addonData from "../../../../../addon/MGAProfessions/Data.lua?raw";
import addonHub from "../../../../../addon/MGAProfessions/MGAHub.lua?raw";
import addonLua from "../../../../../addon/MGAProfessions/MGAProfessions.lua?raw";
import addonToc from "../../../../../addon/MGAProfessions/MGAProfessions.toc?raw";
import addonWindow from "../../../../../addon/MGAProfessions/Window.lua?raw";

/** The MGA Professions addon's folder in the download: `Interface\AddOns\MGAProfessions`. */
export const PROFESSIONS_ADDON_FOLDER = "MGAProfessions";

export const PROFESSIONS_ADDON_ZIP_NAME = "MGAProfessions.zip";

/** The addon's files, from `apps/mygamingassistant/frontend/addon/MGAProfessions` (`Data.lua` is generated from the Professions data). */
export const PROFESSIONS_ADDON_FILES: Readonly<Record<string, string>> = {
  "MGAProfessions.toc": addonToc,
  "MGAHub.lua": addonHub,
  "Bindings.xml": addonBindings,
  "Data.lua": addonData,
  "Core.lua": addonCore,
  "Window.lua": addonWindow,
  "MGAProfessions.lua": addonLua,
};
