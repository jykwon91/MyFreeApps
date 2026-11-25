import { showSuccess } from "@platform/ui";
import { PVPLOG_ADDON_ZIP_NAME } from "@/games/wow-forever/data/pvpLogAddon/pvpLogAddonFiles";
import { pvpLogAddonZip } from "@/games/wow-forever/lib/pvpLogAddon/pvpLogAddonZip";
import { downloadZip } from "@/lib/downloadBlob";

/** Saves MGAPvPLog.zip and says how to install it. */
export function downloadPvPLogAddon(): void {
  downloadZip(pvpLogAddonZip(), PVPLOG_ADDON_ZIP_NAME);
  showSuccess("MGA PvP Log is downloading. Unzip it into your AddOns folder.");
}
