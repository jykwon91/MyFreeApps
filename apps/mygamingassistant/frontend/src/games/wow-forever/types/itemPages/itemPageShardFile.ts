import type { ClientItemFile } from "@/games/wow-forever/types/clientItemFile";
import type { RawItemFacts } from "@/games/wow-forever/types/itemPages/rawItemFacts";

/** `data/items/pages/NN.json` (Forever client), written by `scripts/wow_item_pages/build.py`. */
export interface ItemPageShardFile extends ClientItemFile {
  shard: number;
  shardCount: number;
  craftedColumns: readonly string[];
  facts: Readonly<Record<string, RawItemFacts>>;
}
