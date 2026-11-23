import { PROFESSIONS_ADDON_FILES, PROFESSIONS_ADDON_FOLDER } from "@/games/wow-forever/data/professionsAddon/professionsAddonFiles";
import { zipAddonFolder } from "@/games/wow-forever/lib/addons/zipAddonFolder";

/** The MGA Professions addon folder, zipped. Unzips straight into `Interface\AddOns`. */
export function professionsAddonZip(): Uint8Array {
  return zipAddonFolder(PROFESSIONS_ADDON_FOLDER, PROFESSIONS_ADDON_FILES);
}
