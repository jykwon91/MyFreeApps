import type { ClassicItemShardFile } from "@/games/wow-forever/types/itemPages/classicItemShardFile";
import type { ItemPageShardFile } from "@/games/wow-forever/types/itemPages/itemPageShardFile";

/**
 * The item pages' shards, each its own lazy chunk: a page loads one Forever
 * shard and one Classic shard (~12 KB gzipped together), never the whole set.
 * Globbed rather than imported so neither the main bundle nor the type checker
 * carries them.
 */
export const FOREVER_ITEM_SHARDS = import.meta.glob<ItemPageShardFile>("../items/pages/[0-9][0-9].json", { import: "default" });

export const CLASSIC_ITEM_SHARDS = import.meta.glob<ClassicItemShardFile>("../items/pages/classic/[0-9][0-9].json", {
  import: "default",
});
