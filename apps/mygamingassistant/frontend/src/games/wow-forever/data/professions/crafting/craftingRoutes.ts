import { ENCHANTING_ROUTE } from "@/games/wow-forever/data/professions/crafting/enchantingRoute";
import { TAILORING_ROUTE } from "@/games/wow-forever/data/professions/crafting/tailoringRoute";
import type { CraftingProfession, CraftRouteEntry } from "@/games/wow-forever/types/crafting";

export const CRAFTING_ROUTES: Readonly<Record<CraftingProfession, readonly CraftRouteEntry[]>> = {
  tailoring: TAILORING_ROUTE,
  enchanting: ENCHANTING_ROUTE,
};
