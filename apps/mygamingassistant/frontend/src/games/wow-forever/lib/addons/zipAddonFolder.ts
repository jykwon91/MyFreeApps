import { strToU8, zipSync } from "fflate";

/** Addon folders zipped side by side, so the zip unzips straight into `Interface\AddOns`. */
export function zipAddonFolders(folders: Readonly<Record<string, Readonly<Record<string, string>>>>): Uint8Array {
  const zipped: Record<string, Record<string, Uint8Array>> = {};
  for (const [folder, files] of Object.entries(folders)) {
    zipped[folder] = {};
    for (const [name, text] of Object.entries(files)) zipped[folder][name] = strToU8(text);
  }
  return zipSync(zipped);
}

/** An addon's files zipped inside its folder, so the zip unzips straight into `Interface\AddOns`. */
export function zipAddonFolder(folder: string, files: Readonly<Record<string, string>>): Uint8Array {
  return zipAddonFolders({ [folder]: files });
}
