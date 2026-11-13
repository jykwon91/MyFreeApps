/** What editing a recipe's details and deleting it say, worded the same on web and phone. */
export const RECIPE_MANAGE_MESSAGES = {
  editTitle: "Edit recipe details",
  editIntro: "Change the title, description, or source. To change ingredients or steps, make a tweak instead.",
  updated: "Recipe updated.",
  couldntUpdate: "Couldn't save those changes — please try again.",
  deleteTitle: "Delete this recipe?",
  deleteBody: "This removes the recipe and its whole version history from your list. This can't be undone here.",
  deleteConfirm: "Delete recipe",
  deleted: "Recipe deleted.",
  couldntDelete: "Couldn't delete this recipe — please try again.",
} as const;
