import { EXPLORER_ADDON_FILES, EXPLORER_ADDON_FOLDER } from "@/games/wow-forever/data/explorerAddon/explorerAddonFiles";
import { WAYPOINTS_ADDON_FILES, WAYPOINTS_ADDON_FOLDER } from "@/games/wow-forever/data/waypointsAddon/waypointsAddonFiles";
import { zipAddonFolders } from "@/games/wow-forever/lib/addons/zipAddonFolder";

/** MGA Explorer with MGA Waypoints beside it (Explorer needs it for the arrow and pins), zipped. Unzips straight into `Interface\AddOns`. */
export function explorerAddonZip(): Uint8Array {
  return zipAddonFolders({ [EXPLORER_ADDON_FOLDER]: EXPLORER_ADDON_FILES, [WAYPOINTS_ADDON_FOLDER]: WAYPOINTS_ADDON_FILES });
}
