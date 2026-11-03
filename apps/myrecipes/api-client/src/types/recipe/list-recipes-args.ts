/**
 * Arguments for the recipes list query.
 *
 * Public-read / auth-write: ``search`` free-text filters the public library;
 * ``owner: "me"`` narrows to the signed-in user's own recipes (the "My recipes"
 * filter chip, rendered only when authenticated).
 */
export interface ListRecipesArgs {
  search?: string;
  owner?: "me";
}
