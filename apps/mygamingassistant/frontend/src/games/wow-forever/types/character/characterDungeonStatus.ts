import type { DUNGEON_STATUS } from "@/games/wow-forever/data/character/characterDungeonStatus";

export type CharacterDungeonStatus = (typeof DUNGEON_STATUS)[keyof typeof DUNGEON_STATUS];
