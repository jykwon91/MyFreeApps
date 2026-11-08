import type { DownrankFamily } from "@/games/wow-forever/types/downrank/downrankFamily";

/** `data/downrank/spells.json`: every family with its Forever ranks. */
export interface DownrankFile {
  source: string;
  clientBuild: string;
  families: readonly DownrankFamily[];
}
