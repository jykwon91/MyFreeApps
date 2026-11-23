/** The owner attribution under a recipe's title or on its card, worded the same on the website and the phone. */
export const RECIPE_BYLINE = {
  byOwner: (name: string) => `by ${name}`,
} as const;
