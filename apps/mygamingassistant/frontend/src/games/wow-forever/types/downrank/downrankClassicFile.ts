import type { DownrankRank } from "@/games/wow-forever/types/downrank/downrankRank";

/** `data/downrank/classic/ranks.json`: ranks Forever's files lack, filled from Classic. */
export interface DownrankClassicFile {
  source: string;
  families: readonly { id: string; ranks: readonly DownrankRank[] }[];
}
