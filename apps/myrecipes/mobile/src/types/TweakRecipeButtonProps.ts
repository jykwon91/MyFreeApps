import type { TweakEntryPoint } from "./TweakEntryPoint";

export interface TweakRecipeButtonProps {
  recipeId: string;
  /** Where it's opened from, when that isn't the recipe, so the form's Back is named for it. */
  from?: TweakEntryPoint;
}
