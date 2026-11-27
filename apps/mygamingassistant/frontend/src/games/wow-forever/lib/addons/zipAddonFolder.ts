import { strToU8, zipSync } from "fflate";
import { HUB_ADDON_FILES, HUB_ADDON_FOLDER } from "@/games/wow-forever/data/hubAddon/hubAddonFiles";

/**
 * MGA addon folders zipped side by side with the MGAHub folder every one of them depends on,
 * so the zip unzips straight into `Interface\AddOns`.
 */
export function zipAddonFolders(folders: Readonly<Record<string, Readonly<Record<string, string>>>>): Uint8Array {
  const zipped: Record<string, Record<string, Uint8Array>> = {};
  for (const [folder, files] of Object.entries({ ...folders, [HUB_ADDON_FOLDER]: HUB_ADDON_FILES })) {
    zipped[folder] = {};
    for (const [name, text] of Object.entries(files)) zipped[folder][name] = strToU8(text);
  }
  return zipSync(zipped);
}

/** An MGA addon's files zipped inside its folder, next to MGAHub, so the zip unzips straight into `Interface\AddOns`. */
export function zipAddonFolder(folder: string, files: Readonly<Record<string, string>>): Uint8Array {
  return zipAddonFolders({ [folder]: files });
}
