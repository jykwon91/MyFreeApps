import type { CharacterDungeon } from "@/games/wow-forever/types/character/characterDungeon";

/** `CharacterResponse.dungeons`: every dungeon in level order, done or not. */
export interface CharacterDungeons {
  /** Blizzard's "Total 5-player dungeons entered". */
  runs: number;
  dungeons: CharacterDungeon[];
}
