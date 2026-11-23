/** What a screen reader is told when a recipe row changes place, worded the same wherever rows can be moved. */
export const RECIPE_ROW_ANNOUNCEMENTS = {
  moved: (noun: "ingredient" | "step", from: number, direction: -1 | 1, to: number) =>
    `Moved ${noun} ${from} ${direction === -1 ? "up" : "down"} to ${to}`,
} as const;
