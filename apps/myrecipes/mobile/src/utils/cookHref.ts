/** Where cook mode for a recipe lives. */
export function cookHref(recipeId: string) {
  return { pathname: "/recipes/[id]/cook", params: { id: recipeId } } as const;
}
