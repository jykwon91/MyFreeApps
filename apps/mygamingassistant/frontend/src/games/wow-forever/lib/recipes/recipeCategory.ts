import { CONSUMABLE_SUBCLASS_CATEGORY, ITEM_CLASS_CATEGORY } from "@/games/wow-forever/data/recipes/recipesConfig";
import { RECIPE_CATEGORY, type RecipeCategory } from "@/games/wow-forever/types/recipes/recipeCategory";
import type { RecipeProfession } from "@/games/wow-forever/types/recipes/recipeProfession";
import type { ItemCategoryPlace } from "@/games/wow-forever/types/auctionHouse/itemCategoryPlace";

interface CategoryInput {
  profession: RecipeProfession;
  enchant: boolean;
  /** Where the Auction house files the made item; undefined when it isn't listed. */
  place: ItemCategoryPlace | undefined;
  /** The made item's class in the game files; undefined when the data doesn't say (Cooking). */
  itemClass: number | undefined;
}

/** A profession whose recipes all make one kind of thing, for an item the game files don't class. */
function professionDefault(profession: RecipeProfession): RecipeCategory {
  if (profession === "cooking") return RECIPE_CATEGORY.food;
  if (profession === "firstaid") return RECIPE_CATEGORY.bandages;
  return RECIPE_CATEGORY.other;
}

/** What a recipe makes, from the game's own item class and subclass — never from the name. */
export function recipeCategory({ profession, enchant, place, itemClass }: CategoryInput): RecipeCategory {
  if (enchant) return RECIPE_CATEGORY.enchants;
  // Weapon and armor are classes the Auction house folds into one "gear" place.
  const byClass = itemClass === undefined ? undefined : ITEM_CLASS_CATEGORY[itemClass];
  if (byClass === RECIPE_CATEGORY.weapons || byClass === RECIPE_CATEGORY.armor) return byClass;
  switch (place?.category) {
    case "consumable":
      return CONSUMABLE_SUBCLASS_CATEGORY[place.subclass ?? -1] ?? RECIPE_CATEGORY.consumables;
    case "container":
    case "quiver":
      return RECIPE_CATEGORY.bags;
    case "projectile":
      return RECIPE_CATEGORY.ammo;
    case "trade-goods":
    case "reagent":
      return RECIPE_CATEGORY.tradeGoods;
    case "gear":
      return RECIPE_CATEGORY.armor;
    default: {
      // Not on the Auction house list: Cooking and First Aid still make food and bandages; else go by the class.
      const fallback = professionDefault(profession);
      return fallback !== RECIPE_CATEGORY.other ? fallback : (byClass ?? RECIPE_CATEGORY.other);
    }
  }
}
