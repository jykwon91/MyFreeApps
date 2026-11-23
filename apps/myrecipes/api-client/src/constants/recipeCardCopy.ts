/** The cook line on a recipe card, worded the same on the website and the phone. */
export const RECIPE_CARD_COPY = {
  notCooked: "Not cooked yet",
  lastCooked: (date: string) => `Last cooked ${date}`,
} as const;
