import type { RecipeExtractionDraft } from "@myrecipes/api-client/types/recipe/extraction";
import type { PhotoImportProblem } from "./PhotoImportProblem";
import type { RecipePhoto } from "./RecipePhoto";

/** The steps of importing a recipe from a photo, as the website's /recipes/import has them. */
export type PhotoImportState =
  | { step: "choose"; problem: PhotoImportProblem | null }
  | { step: "preview"; photo: RecipePhoto; problem: string | null }
  | { step: "reading"; photo: RecipePhoto; startedAt: number }
  | { step: "review"; draft: RecipeExtractionDraft };
