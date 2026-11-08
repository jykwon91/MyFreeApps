import type { RouteStep } from "@/games/wow-forever/data/professions/professionTypes";
import type { ResolvedRouteEntry } from "@/games/wow-forever/types/crafting";

/** A profession's whole route as its guide has it: a crafting route joined to the recipe data, or a hand-written one. */
export type AskProfessionRoute =
  | { kind: "crafting"; entries: readonly ResolvedRouteEntry[]; priced: boolean }
  | { kind: "guide"; steps: readonly RouteStep[] };
