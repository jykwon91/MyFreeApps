/** The version panel on the recipe page when the selected version won't load. */
export const VERSION_LOAD_FAILED_MESSAGES = {
  heading: "Couldn't load this version",
  body: "Something went wrong loading this version. Try again, or pick another version.",
  tryAgain: "Try again",
};

/** A recipe that exists but couldn't be fetched (dropped connection, server error) — never "not found". */
export const RECIPE_LOAD_FAILED_MESSAGES = {
  heading: "Can't load this recipe",
  body: "Check your connection and try again.",
  tryAgain: "Try again",
};
