import { showSuccess } from "@platform/ui";
import { EXPLORER_ADDON_ZIP_NAME } from "@/games/wow-forever/data/explorerAddon/explorerAddonFiles";
import { explorerAddonZip } from "@/games/wow-forever/lib/explorerAddon/explorerAddonZip";
import { downloadZip } from "@/lib/downloadBlob";

/** Saves MGAExplorer.zip (MGA Explorer + MGA Waypoints) and says how to install it. */
export function downloadExplorerAddon(): void {
  downloadZip(explorerAddonZip(), EXPLORER_ADDON_ZIP_NAME);
  showSuccess("MGA Explorer is downloading. Unzip it into your AddOns folder.");
}
