import indexJson from "@/games/wow-forever/data/changes/index.json";
import type { ChangeIndex } from "@/games/wow-forever/types/changes/changeIndex";
import type { ChangeShardFile } from "@/games/wow-forever/types/changes/changeShardFile";

/** The feed's index (small, in the page's chunk): builds, counts, gaps and each category's shards. */
export const CHANGE_INDEX: ChangeIndex = indexJson;

/**
 * Each shard is its own lazy chunk, loaded only when its category is shown.
 * Keys are `./items.json`, `./classic/talents.json` …; `CHANGE_INDEX.shards` names them.
 */
export const CHANGE_SHARD_FILES = import.meta.glob<ChangeShardFile>(["./*.json", "./classic/*.json", "!./index.json"], {
  import: "default",
});
