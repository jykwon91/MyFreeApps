/** A recipe that exists but couldn't be fetched (dropped connection, server error) — never "not found". Worded the same on the website and the phone. */
export const RECIPE_LOAD_FAILED_COPY = {
  heading: "Can't load this recipe",
  body: "Check your connection and try again.",
} as const;
