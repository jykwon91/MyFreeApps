import { router } from "expo-router";
import { RECIPE_ROUTE_NAME } from "../constants/routes";
import type { StackRoute } from "../types/StackRoute";
import type { StackState } from "../types/StackState";

function isRecipeScreen(route: StackRoute, recipeId: string): boolean {
  return route.name === RECIPE_ROUTE_NAME && !!route.params && "id" in route.params && route.params.id === recipeId;
}

/**
 * To this recipe's own screen. If it's open below, the stack pops back to it, past any diff or list
 * opened from it, and it keeps its own params, such as where it was opened from. Otherwise (a link
 * straight here, another recipe below, or no stack state yet) the recipe opens in this screen's place.
 *
 * It pops by count rather than with dismissTo, which in expo-router 58 matches any recipe screen by
 * name and replaces its params with the ones given.
 */
export function leaveToRecipe(stack: StackState | undefined, recipeId: string): void {
  const below = stack ? stack.routes.slice(0, stack.index) : [];
  const at = below.findLastIndex((route) => isRecipeScreen(route, recipeId));
  if (at === -1) {
    router.replace({ pathname: "/recipes/[id]", params: { id: recipeId } });
    return;
  }
  const count = below.length - at;
  if (count === 1) router.back();
  else router.dismiss(count);
}
