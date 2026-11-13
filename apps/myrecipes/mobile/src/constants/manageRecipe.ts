/**
 * Copy for editing a recipe's details and deleting it on the phone. What a save or delete says
 * afterwards, and the delete question, come from the API client, worded as the website words them.
 */
export const MANAGE_RECIPE_MESSAGES = {
  edit: "Edit details",
  editHint: "Change the title, description, or source.",
  save: "Save changes",
  saving: "Saving…",
  cancel: "Cancel",
  deleting: "Deleting…",
  deleteHint: "Asks before deleting the recipe and its whole version history.",
  gone: "This recipe was already deleted.",
} as const;

/** Names the delete's state in the cache, so the recipe screen can tell its own delete is under way. */
export const DELETE_RECIPE_CACHE_KEY_PREFIX = "delete-recipe-";
