import { router } from "expo-router";

/** Back to whatever opened this screen, or the recipe in its place when there's no history. */
export function goBackOrOpenRecipe(recipeId: string): void {
  if (router.canGoBack()) router.back();
  else router.replace({ pathname: "/recipes/[id]", params: { id: recipeId } });
}
