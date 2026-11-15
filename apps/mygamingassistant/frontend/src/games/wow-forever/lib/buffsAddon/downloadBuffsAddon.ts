import { showSuccess } from "@platform/ui";
import { BUFFS_ADDON_ZIP_NAME } from "@/games/wow-forever/data/buffsAddon/buffsAddonFiles";
import { buffsAddonZip } from "@/games/wow-forever/lib/buffsAddon/buffsAddonZip";
import { downloadZip } from "@/lib/downloadBlob";

/** Saves MGABuffs.zip and says how to install it. */
export function downloadBuffsAddon(): void {
  downloadZip(buffsAddonZip(), BUFFS_ADDON_ZIP_NAME);
  showSuccess("MGA Buffs is downloading. Unzip it into your AddOns folder.");
}
