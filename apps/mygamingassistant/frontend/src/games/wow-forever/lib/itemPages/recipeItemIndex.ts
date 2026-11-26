import type { CraftingFile, CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { RecipeItem } from "@/games/wow-forever/types/itemPages/recipeItem";

/** Every recipe-teaching item by id, from the profession data. The first recipe an item teaches wins. */
export function buildRecipeItemIndex(files: ReadonlyMap<CraftingProfession, CraftingFile>): ReadonlyMap<number, RecipeItem> {
  const index = new Map<number, RecipeItem>();
  for (const [profession, file] of files) {
    for (const recipe of file.recipes) {
      const { learn } = recipe;
      if (learn.source !== "item" || index.has(learn.itemId)) continue;
      index.set(learn.itemId, {
        itemId: learn.itemId,
        name: learn.item,
        profession,
        skill: learn.skill,
        estimated: learn.estimated === true,
        bop: learn.bop === true,
        recipeName: recipe.name,
        creates: recipe.creates ? { id: recipe.creates.id, name: recipe.creates.name } : null,
        reagents: recipe.reagents,
      });
    }
  }
  return index;
}
