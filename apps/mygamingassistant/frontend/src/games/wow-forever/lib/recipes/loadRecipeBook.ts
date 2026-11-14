import { loadAllCraftingData } from "@/games/wow-forever/crafting/loadCraftingData";
import { loadItemCategories } from "@/games/wow-forever/lib/itemCategoriesLoader";
import { buildRecipeBook } from "@/games/wow-forever/lib/recipes/buildRecipeBook";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

let cached: Promise<readonly RecipeEntry[]> | null = null;

async function load(): Promise<readonly RecipeEntry[]> {
  const [crafting, food, foodSources, categories] = await Promise.all([
    loadAllCraftingData(),
    import("@/games/wow-forever/data/food/foodData"),
    import("@/games/wow-forever/data/food/recipeSourceData"),
    loadItemCategories(),
  ]);
  return buildRecipeBook({
    crafting,
    foods: food.FOODS,
    foodTrainerSkills: food.TRAINER_SKILLS,
    foodSources: foodSources.FOOD_SOURCES,
    categories,
  });
}

/** Every recipe, loaded once (each data file in its own chunk; a failed load is tried again next time). */
export function loadRecipeBook(): Promise<readonly RecipeEntry[]> {
  if (!cached) {
    cached = load().catch((error: unknown) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}
