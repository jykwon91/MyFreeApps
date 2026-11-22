import { CONNECTION_MESSAGES } from "./connectionCopy";

/** The recipes list (GET /recipes) when it can't be loaded, worded the same on the website and the phone. */
export const RECIPES_LIST_ERROR_COPY = {
  heading: "Can't load recipes",
  offline: CONNECTION_MESSAGES.recipesList,
  server: "Something went wrong loading your recipes. Try again in a moment.",
} as const;
