import hubBindings from "../../../../../addon/MGAHub/Bindings.xml?raw";
import hubLua from "../../../../../addon/MGAHub/MGAHub.lua?raw";
import hubToc from "../../../../../addon/MGAHub/MGAHub.toc?raw";

/** The MGA hub addon's folder in every download: `Interface\AddOns\MGAHub`. Every other MGA addon depends on it. */
export const HUB_ADDON_FOLDER = "MGAHub";

/** The hub's files, from `apps/mygamingassistant/frontend/addon/MGAHub`. */
export const HUB_ADDON_FILES: Readonly<Record<string, string>> = {
  "MGAHub.toc": hubToc,
  "MGAHub.lua": hubLua,
  "Bindings.xml": hubBindings,
};
