import type { StepResponse } from "@myrecipes/api-client/types/recipe/step";

/** What a step list shows: a saved recipe's step, or one read off a web page. */
export type RecipeStepLine = Pick<StepResponse, "id" | "position" | "instruction">;
