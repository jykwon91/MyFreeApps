import { router } from "expo-router";

/** Back to the recipe a screen was opened from, or the recipe in its place when there's no history. */
export function leaveToRecipe(recipeId: string): void {
  if (router.canGoBack()) router.back();
  else router.replace({ pathname: "/recipes/[id]", params: { id: recipeId } });
}
