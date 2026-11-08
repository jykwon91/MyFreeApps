import type { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";

/** `dungeon_info`: one dungeon's levels, where its door is and its bosses. */
export interface AskDungeonCard {
  kind: typeof ASK_CARD.dungeon;
  slug: string;
  name: string;
  levelMin: number;
  levelMax: number;
  requiredLevel: number;
  /** The zones its doors are in. */
  zones: string[];
  bosses: string[];
  /** The boss the question named, when the dungeon was found by a boss. */
  matchedBoss: string | null;
}
