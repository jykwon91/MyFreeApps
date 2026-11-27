import { zipAddonFolder } from "@/games/wow-forever/lib/addons/zipAddonFolder";

/** Loads the MGA Drops files (a separate chunk: Data.lua is about 1 MB) and zips them inside their folder. */
export async function loadDropsAddonZip(): Promise<Uint8Array> {
  const { DROPS_ADDON_FILES, DROPS_ADDON_FOLDER } = await import("@/games/wow-forever/data/dropsAddon/dropsAddonFiles");
  return zipAddonFolder(DROPS_ADDON_FOLDER, DROPS_ADDON_FILES);
}
