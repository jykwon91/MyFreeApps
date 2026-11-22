import { WAYPOINTS_ADDON_FILES, WAYPOINTS_ADDON_FOLDER } from "@/games/wow-forever/data/waypointsAddon/waypointsAddonFiles";
import { zipAddonFolder } from "@/games/wow-forever/lib/addons/zipAddonFolder";

/** The MGA Waypoints addon folder, zipped. Unzips straight into `Interface\AddOns`. */
export function waypointsAddonZip(): Uint8Array {
  return zipAddonFolder(WAYPOINTS_ADDON_FOLDER, WAYPOINTS_ADDON_FILES);
}
