/** What a stop on the plan is for. */
export const PLAN_STOP_KIND = {
  /** Buy the materials at an auction house. */
  auction: "auction",
  /** Learn a profession you don't have yet (Apprentice). */
  learn: "learn",
  /** Train the next rank: Journeyman, Expert or Artisan (a trainer, a book or a quest). */
  rank: "rank",
  /** Get a recipe: buy it, do its quest, farm its drop or learn it from a trainer. */
  recipe: "recipe",
} as const;
export type PlanStopKind = (typeof PLAN_STOP_KIND)[keyof typeof PLAN_STOP_KIND];
