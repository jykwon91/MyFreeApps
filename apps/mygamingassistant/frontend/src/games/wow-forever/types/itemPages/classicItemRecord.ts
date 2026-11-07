import type { SourceCell } from "@/games/wow-forever/data/spotDecode";
import type { RawSources } from "@/games/wow-forever/data/sourceDecode";

/** One item's Classic sources in a shard: the food pages' shape plus dungeon / raid drops. */
export interface ClassicItemRecord extends RawSources {
  /** Rows `[name, minLevel, maxLevel, chance, instance map id, kind]`. */
  instance?: { mobs: (readonly SourceCell[])[]; more: number };
}
