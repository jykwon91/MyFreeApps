import { COOKING_ROUTE } from "@/games/wow-forever/data/professions/cooking";
import { FISHING_ROUTE } from "@/games/wow-forever/data/professions/fishing";
import { HERBALISM_ROUTE } from "@/games/wow-forever/data/professions/gathering/herbalism";
import { MINING_ROUTE } from "@/games/wow-forever/data/professions/gathering/mining";
import { SKINNING_ROUTE } from "@/games/wow-forever/data/professions/gathering/skinning";
import type { Profession, RouteStep } from "@/games/wow-forever/data/professions/professionTypes";

/** The hand-written routes of the guides that aren't crafting guides, by profession. */
export const GUIDE_ROUTES: Readonly<Record<Profession, readonly RouteStep[]>> = {
  cooking: COOKING_ROUTE,
  fishing: FISHING_ROUTE,
  herbalism: HERBALISM_ROUTE,
  mining: MINING_ROUTE,
  skinning: SKINNING_ROUTE,
};
