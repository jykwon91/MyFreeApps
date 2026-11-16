import type { SourceCell } from "@/games/wow-forever/data/spotDecode";

/** Dungeon / raid drops as the generators write them: rows `[name, minLevel, maxLevel, chance, instance map id, kind]`. */
export interface RawInstanceDrop {
  mobs: (readonly SourceCell[])[];
  more: number;
}
