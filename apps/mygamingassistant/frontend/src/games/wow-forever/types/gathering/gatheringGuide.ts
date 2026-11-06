import type { CraftingTrainers } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import type { ForeverChange, HowToStep, RouteStep } from "@/games/wow-forever/data/professions/professionTypes";
import type { GatheringCrafts } from "@/games/wow-forever/types/gathering/gatheringCrafts";
import type { GatheringNode } from "@/games/wow-forever/types/gathering/gatheringNode";
import type { GatheringRank } from "@/games/wow-forever/types/gathering/gatheringRank";

/** Everything one gathering guide (Mining, Herbalism) shows. Fill one per `GatheringProfession`. */
export interface GatheringGuide {
  /** "Mining". */
  label: string;
  /** "mine" — "What can I mine right now?". */
  verb: string;
  /** "Ore" / "Herb" — the full table's first column. */
  nodeLabel: string;
  /** Lowest skill first. */
  nodes: readonly GatheringNode[];
  /** Lowest first; the first is what any trainer teaches. */
  ranks: readonly GatheringRank[];
  trainers: CraftingTrainers;
  /** Under the trainer list: Junior trainers aren't World Map NPCs, so they're text only. */
  trainerNote: string;
  steps: readonly HowToStep[];
  route: readonly RouteStep[];
  routeIntro: string;
  routeColumns: { name: string; materials: string; source: string };
  forever: readonly ForeverChange[];
  crafts: GatheringCrafts | null;
}
