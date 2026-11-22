import addonBindings from "../../../../../addon/MGAWaypoints/Bindings.xml?raw";
import addonCore from "../../../../../addon/MGAWaypoints/Core.lua?raw";
import addonData from "../../../../../addon/MGAWaypoints/Data.lua?raw";
import addonDisplay from "../../../../../addon/MGAWaypoints/Display.lua?raw";
import addonHub from "../../../../../addon/MGAWaypoints/MGAHub.lua?raw";
import addonLua from "../../../../../addon/MGAWaypoints/MGAWaypoints.lua?raw";
import addonToc from "../../../../../addon/MGAWaypoints/MGAWaypoints.toc?raw";
import addonPicker from "../../../../../addon/MGAWaypoints/Picker.lua?raw";

/** The MGA Waypoints addon's folder in the download: `Interface\AddOns\MGAWaypoints`. */
export const WAYPOINTS_ADDON_FOLDER = "MGAWaypoints";

export const WAYPOINTS_ADDON_ZIP_NAME = "MGAWaypoints.zip";

/** The addon's files, from `apps/mygamingassistant/frontend/addon/MGAWaypoints` (`Data.lua` is generated from the World Map data). */
export const WAYPOINTS_ADDON_FILES: Readonly<Record<string, string>> = {
  "MGAWaypoints.toc": addonToc,
  "MGAHub.lua": addonHub,
  "Bindings.xml": addonBindings,
  "Data.lua": addonData,
  "Core.lua": addonCore,
  "Display.lua": addonDisplay,
  "Picker.lua": addonPicker,
  "MGAWaypoints.lua": addonLua,
};
