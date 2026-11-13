import { strToU8, zipSync } from "fflate";

/** An addon's files zipped inside its folder, so the zip unzips straight into `Interface\AddOns`. */
export function zipAddonFolder(folder: string, files: Readonly<Record<string, string>>): Uint8Array {
  const zipped: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(files)) zipped[name] = strToU8(text);
  return zipSync({ [folder]: zipped });
}
