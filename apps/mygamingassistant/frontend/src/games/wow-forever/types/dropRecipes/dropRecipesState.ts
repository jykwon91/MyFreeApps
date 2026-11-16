import type { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import type { DropRecipe } from "@/games/wow-forever/types/dropRecipes/dropRecipe";

export type DropRecipesState =
  | { status: typeof LOAD_STATUS.loading }
  | { status: typeof LOAD_STATUS.error; retry: () => void }
  | { status: typeof LOAD_STATUS.ready; recipes: readonly DropRecipe[] };
