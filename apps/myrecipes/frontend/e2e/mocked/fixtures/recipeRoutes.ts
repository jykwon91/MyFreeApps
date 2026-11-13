/** URL patterns and path pieces of the recipes API, shared by the no-backend specs and their stubs. */
import { DEFAULT_API_BASE } from "@platform/ui/test-support/constants/defaultApiBase";

/** GET/POST /recipes (the collection), with or without a query string. */
export const RECIPES_COLLECTION_ROUTE = new RegExp(`${DEFAULT_API_BASE}/recipes(\\?|$)`);

/** The path segment after /recipes/:id that holds a recipe's versions. */
export const VERSIONS_SUFFIX = "/versions";

/** Everything under one recipe: /recipes/:id and any path below it. */
export function recipeRoute(recipeId: string): RegExp {
  return new RegExp(`${DEFAULT_API_BASE}/recipes/${recipeId}(/.*)?(\\?.*)?$`);
}
