/** Where a drop-only recipe's item drops: named open-world mobs, a dungeon, a raid, or any mob in a level range. */
export const DROP_RECIPE_SOURCE = {
  openWorld: "open-world",
  dungeon: "dungeon",
  raid: "raid",
  random: "random",
} as const;

export type DropRecipeSource = (typeof DROP_RECIPE_SOURCE)[keyof typeof DROP_RECIPE_SOURCE];
