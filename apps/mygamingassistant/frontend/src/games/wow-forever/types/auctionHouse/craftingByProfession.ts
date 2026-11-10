import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { CraftingData } from "@/games/wow-forever/types/craftingData";

/** Every crafting profession's loaded recipe data. */
export type CraftingByProfession = ReadonlyMap<CraftingProfession, CraftingData>;
