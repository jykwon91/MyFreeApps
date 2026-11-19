import addonData from "../../../../../addon/MGADungeonQuests/Data.lua?raw";
import addonLua from "../../../../../addon/MGADungeonQuests/MGADungeonQuests.lua?raw";
import addonToc from "../../../../../addon/MGADungeonQuests/MGADungeonQuests.toc?raw";
import addonTurnIns from "../../../../../addon/MGADungeonQuests/TurnIns.lua?raw";

/** The MGA Dungeon Quests addon's folder in the download: `Interface\AddOns\MGADungeonQuests`. */
export const DUNGEON_QUESTS_ADDON_FOLDER = "MGADungeonQuests";

export const DUNGEON_QUESTS_ADDON_ZIP_NAME = "MGADungeonQuests.zip";

/** The addon's files, from `apps/mygamingassistant/frontend/addon/MGADungeonQuests` (`Data.lua` is generated from the dungeon pages, `TurnIns.lua` from the quest pages). */
export const DUNGEON_QUESTS_ADDON_FILES: Readonly<Record<string, string>> = {
  "MGADungeonQuests.toc": addonToc,
  "Data.lua": addonData,
  "TurnIns.lua": addonTurnIns,
  "MGADungeonQuests.lua": addonLua,
};
