/** Where cook mode for a recipe lives. */
export function cookHref(recipeId: string) {
  return { pathname: "/recipes/[id]/cook", params: { id: recipeId } } as const;
}

const COOK_PATH = /^\/recipes\/([^/]+)\/cook$/;

/** The recipe whose cook mode `pathname` is, or null when it's any other screen. */
export function cookRecipeIdAt(pathname: string): string | null {
  const match = COOK_PATH.exec(pathname);
  return match ? decodeURIComponent(match[1]!) : null;
}
