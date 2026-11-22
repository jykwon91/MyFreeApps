import { showSuccess } from "@platform/ui";
import { WAYPOINTS_ADDON_ZIP_NAME } from "@/games/wow-forever/data/waypointsAddon/waypointsAddonFiles";
import { waypointsAddonZip } from "@/games/wow-forever/lib/waypointsAddon/waypointsAddonZip";
import { downloadZip } from "@/lib/downloadBlob";

/** Saves MGAWaypoints.zip and says how to install it. */
export function downloadWaypointsAddon(): void {
  downloadZip(waypointsAddonZip(), WAYPOINTS_ADDON_ZIP_NAME);
  showSuccess("MGA Waypoints is downloading. Unzip it into your AddOns folder.");
}
