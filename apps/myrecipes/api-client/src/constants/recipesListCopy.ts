import { CONNECTION_MESSAGES } from "./connectionCopy";

/** The recipes list (GET /recipes) when it can't be loaded, worded the same on the website and the phone. */
export const RECIPES_LIST_ERROR_COPY = {
  heading: "Can't load recipes",
  offline: CONNECTION_MESSAGES.recipesList,
  server: "Something went wrong loading your recipes. Try again in a moment.",
} as const;

/** The recipes list narrowed to the signed-in user's own recipes when they have none, worded the same on the website and the phone. */
export const RECIPES_MINE_EMPTY_COPY = {
  heading: "None of your recipes yet",
  body: "Recipes you create will show up here.",
  actionLabel: "Show all recipes",
} as const;
