import type { RecipePhoto } from "./RecipePhoto";

/** What picking gave: a photo, nothing (the picker was closed), or no camera access. */
export type PickedRecipePhoto = RecipePhoto | "denied" | null;
