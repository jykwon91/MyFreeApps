import type { CraftingProfession } from "@/games/wow-forever/types/crafting";

/** A profession with recipes on the Recipes page: the crafting ones, plus Cooking. */
export type RecipeProfession = CraftingProfession | "cooking";
