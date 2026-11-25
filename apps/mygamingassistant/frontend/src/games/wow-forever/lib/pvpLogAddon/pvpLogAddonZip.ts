import { PVPLOG_ADDON_FILES, PVPLOG_ADDON_FOLDER } from "@/games/wow-forever/data/pvpLogAddon/pvpLogAddonFiles";
import { zipAddonFolder } from "@/games/wow-forever/lib/addons/zipAddonFolder";

/** The MGA PvP Log addon folder, zipped. Unzips straight into `Interface\AddOns`. */
export function pvpLogAddonZip(): Uint8Array {
  return zipAddonFolder(PVPLOG_ADDON_FOLDER, PVPLOG_ADDON_FILES);
}
