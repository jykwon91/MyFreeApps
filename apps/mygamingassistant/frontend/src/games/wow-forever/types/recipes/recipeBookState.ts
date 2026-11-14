import type { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

export type RecipeBookState =
  | { status: typeof LOAD_STATUS.loading }
  | { status: typeof LOAD_STATUS.error; retry: () => void }
  | { status: typeof LOAD_STATUS.ready; entries: readonly RecipeEntry[] };
