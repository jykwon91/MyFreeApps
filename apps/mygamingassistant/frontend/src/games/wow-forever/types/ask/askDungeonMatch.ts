import type { Dungeon } from "@/games/wow-forever/types/dungeons/dungeon";

/** A dungeon `dungeon_info` matched: lower score = better; `boss` when it matched by a boss's name. */
export interface AskDungeonMatch {
  dungeon: Dungeon;
  score: number;
  boss: string | null;
}
