import type { ChangeCategory } from "@/games/wow-forever/types/changes/changeCategory";
import type { ChangeCounts } from "@/games/wow-forever/types/changes/changeCounts";
import type { ChangeGaps } from "@/games/wow-forever/types/changes/changeGaps";

/** `data/changes/index.json` (GENERATED): the builds compared, counts, gaps and each category's shards. */
export interface ChangeIndex {
  source: string;
  classicSource: string;
  attribution: string;
  build: string;
  classicBuild: string;
  /** The build the last refresh compared; null until the feed has been refreshed once. */
  previousBuild: string | null;
  questsSeenOn: string;
  counts: Readonly<Record<ChangeCategory, ChangeCounts>>;
  /** Shard paths relative to `data/changes/`. */
  shards: Readonly<Record<ChangeCategory, readonly string[]>>;
  gaps: ChangeGaps;
}
