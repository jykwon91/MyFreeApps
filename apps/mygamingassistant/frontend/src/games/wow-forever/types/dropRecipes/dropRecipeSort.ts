/** How the Drop-only recipes list is ordered: by the skill to learn it, or best chance per kill first. */
export const DROP_RECIPE_SORT = {
  skill: "skill",
  odds: "odds",
} as const;

export type DropRecipeSort = (typeof DROP_RECIPE_SORT)[keyof typeof DROP_RECIPE_SORT];
