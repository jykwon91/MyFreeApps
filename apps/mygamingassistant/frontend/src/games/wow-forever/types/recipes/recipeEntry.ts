import type { ItemQuality } from "@/games/wow-forever/data/itemSlots";
import type { CraftReagent, LearnAt } from "@/games/wow-forever/types/crafting";
import type { RecipeCategory } from "@/games/wow-forever/types/recipes/recipeCategory";
import type { RecipeProfession } from "@/games/wow-forever/types/recipes/recipeProfession";
import type { ItemSources } from "@/games/wow-forever/types/recipeSources";
import type { WowIcon } from "@/games/wow-forever/types/icons/wowIcon";

/** One recipe on the Recipes page, from any profession. */
export interface RecipeEntry {
  /** `${profession}:${id}` — unique across professions. */
  key: string;
  profession: RecipeProfession;
  name: string;
  /** The made item's icon, or the spell's for an enchant. */
  icon: WowIcon | null;
  /** The item it makes; null for an enchant. */
  makes: { id: number; name: string; count: number; quality: ItemQuality } | null;
  category: RecipeCategory;
  /** The skill to learn it. */
  skill: number;
  /** Where it turns yellow / green / grey; null when the data doesn't say. */
  yellow: number | null;
  green: number | null;
  grey: number | null;
  reagents: readonly CraftReagent[];
  learn: LearnAt;
  /** Where the recipe item comes from (Classic data); null unless it's learned from an item. */
  recipeSources: ItemSources | null;
  /** Forever added the recipe and no Classic source teaches it (`sourceUnknown`): where to learn it isn't known yet. */
  sourceUnknown: boolean;
  /** "Armorsmith" — only that specialization can learn it. */
  spec: string | null;
  /** The name, normalised for search (`normalizeItemName`). */
  searchName: string;
  /** Normalised words of the recipe and item name, the recipe item's name, and each reagent's name. */
  nameWords: readonly string[];
  recipeItemWords: readonly string[];
  reagentWords: readonly (readonly string[])[];
}
