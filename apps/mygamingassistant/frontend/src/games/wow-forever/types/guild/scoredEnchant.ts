import type { CraftRecipe } from "@/games/wow-forever/types/crafting";
import type { EnchantEffect } from "@/games/wow-forever/types/guild/enchantEffect";

/** An Enchanting recipe with what its tooltip adds. */
export interface ScoredEnchant {
  recipe: CraftRecipe;
  effect: EnchantEffect;
}
