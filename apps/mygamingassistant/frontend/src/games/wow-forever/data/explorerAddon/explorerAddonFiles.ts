import addonBindings from "../../../../../addon/MGAExplorer/Bindings.xml?raw";
import addonCore from "../../../../../addon/MGAExplorer/Core.lua?raw";
import addonData from "../../../../../addon/MGAExplorer/Data.lua?raw";
import addonHub from "../../../../../addon/MGAExplorer/MGAHub.lua?raw";
import addonMapPins from "../../../../../addon/MGAExplorer/MapPins.lua?raw";
import addonLua from "../../../../../addon/MGAExplorer/MGAExplorer.lua?raw";
import addonToc from "../../../../../addon/MGAExplorer/MGAExplorer.toc?raw";
import addonWindow from "../../../../../addon/MGAExplorer/Window.lua?raw";

/** The MGA Explorer addon's folder in the download: `Interface\AddOns\MGAExplorer`. */
export const EXPLORER_ADDON_FOLDER = "MGAExplorer";

export const EXPLORER_ADDON_ZIP_NAME = "MGAExplorer.zip";

/** The addon's files, from `apps/mygamingassistant/frontend/addon/MGAExplorer` (`Data.lua` is generated from `data/explore/explore.json`). */
export const EXPLORER_ADDON_FILES: Readonly<Record<string, string>> = {
  "MGAExplorer.toc": addonToc,
  "MGAHub.lua": addonHub,
  "Bindings.xml": addonBindings,
  "Data.lua": addonData,
  "Core.lua": addonCore,
  "MapPins.lua": addonMapPins,
  "Window.lua": addonWindow,
  "MGAExplorer.lua": addonLua,
};
