import type { ChangeCategory } from "@/games/wow-forever/types/changes/changeCategory";
import type { ChangeFileEntry } from "@/games/wow-forever/types/changes/changeFileEntry";

/** One lazy shard of the feed: `data/changes/items.json`, `classic/talents.json` … */
export interface ChangeShardFile {
  category: ChangeCategory;
  build: string;
  entries: readonly ChangeFileEntry[];
}
