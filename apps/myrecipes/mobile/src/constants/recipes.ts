/** Copy for the phone's recipe list and its cards. */
export const RECIPES_MESSAGES = {
  myRecipes: "My recipes",
  mineEmptyHeading: "None of your recipes yet",
  mineEmptyBody: "Recipes you create will show up here.",
  showAll: "Show all recipes",
  notCooked: "Not cooked yet",
  lastCooked: (date: string) => `Last cooked ${date}`,
  noRating: "No rating",
  byOwner: (name: string) => `by ${name}`,
} as const;

/** How many stars a rating is out of. */
export const MAX_STARS = 5;

export const FILLED_STAR = "★";
export const EMPTY_STAR = "☆";
/** Shown in place of the stars for a recipe that has no rating yet, as the website does. */
export const NO_RATING_DASH = "—";
