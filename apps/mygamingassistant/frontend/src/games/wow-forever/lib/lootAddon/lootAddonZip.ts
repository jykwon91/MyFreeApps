import { LOOT_ADDON_FILES, LOOT_ADDON_FOLDER } from "@/games/wow-forever/data/lootAddon/lootAddonFiles";
import { zipAddonFolder } from "@/games/wow-forever/lib/addons/zipAddonFolder";

/** The MGA Loot addon folder, zipped. Unzips straight into `Interface\AddOns`. */
export function lootAddonZip(): Uint8Array {
  return zipAddonFolder(LOOT_ADDON_FOLDER, LOOT_ADDON_FILES);
}
