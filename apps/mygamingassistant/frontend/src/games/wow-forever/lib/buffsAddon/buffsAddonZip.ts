import { BUFFS_ADDON_FILES, BUFFS_ADDON_FOLDER } from "@/games/wow-forever/data/buffsAddon/buffsAddonFiles";
import { zipAddonFolder } from "@/games/wow-forever/lib/addons/zipAddonFolder";

/** The MGA Buffs addon folder, zipped. Unzips straight into `Interface\AddOns`. */
export function buffsAddonZip(): Uint8Array {
  return zipAddonFolder(BUFFS_ADDON_FOLDER, BUFFS_ADDON_FILES);
}
