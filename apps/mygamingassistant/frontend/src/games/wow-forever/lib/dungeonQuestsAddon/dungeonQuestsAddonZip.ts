import {
  DUNGEON_QUESTS_ADDON_FILES,
  DUNGEON_QUESTS_ADDON_FOLDER,
} from "@/games/wow-forever/data/dungeonQuestsAddon/dungeonQuestsAddonFiles";
import { zipAddonFolder } from "@/games/wow-forever/lib/addons/zipAddonFolder";

/** The MGA Dungeon Quests addon folder, zipped. Unzips straight into `Interface\AddOns`. */
export function dungeonQuestsAddonZip(): Uint8Array {
  return zipAddonFolder(DUNGEON_QUESTS_ADDON_FOLDER, DUNGEON_QUESTS_ADDON_FILES);
}
