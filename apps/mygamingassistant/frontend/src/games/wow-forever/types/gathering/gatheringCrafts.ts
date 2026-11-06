import type { MiningFile } from "@/games/wow-forever/types/gathering/miningFile";

/** A gathering profession's own crafts (Mining's smelting) — a collapsed section after the route. */
export interface GatheringCrafts {
  title: string;
  intro: string;
  /** The generated file — loaded only when the guide opens. */
  load: () => Promise<MiningFile>;
}
