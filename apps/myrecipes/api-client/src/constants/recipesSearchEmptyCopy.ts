/** The recipes list when a search matches nothing, worded the same on the website and the phone. */
export const RECIPES_SEARCH_EMPTY_COPY = {
  heading: "No matches",
  body: (term: string) => `Nothing matches "${term}". Check the spelling or try a shorter word.`,
} as const;
