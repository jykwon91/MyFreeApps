import type { SourceCell } from "@/games/wow-forever/data/spotDecode";
import type { RawSources } from "@/games/wow-forever/data/sourceDecode";

/** `data/items/pages/classic/NN.json` (cmangos classic-db, GPL), written by `scripts/wow_item_pages/build.py`. */
export interface ClassicItemShardFile {
  source: { repo: string; commit: string; license: string };
  shard: number;
  shardCount: number;
  zones: Record<string, string>;
  territory: Record<string, string>;
  /** Quest id -> `[id, title, level, side, givers, minLevel, classes]`. */
  quests: Record<string, readonly SourceCell[]>;
  /** Instance map id -> `[name, type, minLevel, maxLevel, requiredLevel, zone, x, y]`. */
  instances: Record<string, readonly SourceCell[]>;
  /** One item's Classic sources: the food pages' shape, dungeon / raid drops included. */
  items: Record<string, RawSources>;
}
