import type { CraftingTrainers } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import type { ForeverChange, HowToStep, RouteStep } from "@/games/wow-forever/data/professions/professionTypes";
import type { GatheringRank } from "@/games/wow-forever/types/gathering/gatheringRank";

/** What every gathering guide shows, whatever it gathers from. */
export interface GatheringGuideBase {
  /** "Mining". */
  label: string;
  /** "mine" — "What can I mine right now?". */
  verb: string;
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
}
