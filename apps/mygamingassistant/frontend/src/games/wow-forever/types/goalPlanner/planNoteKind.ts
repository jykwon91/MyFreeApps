/** Why the plan carries a note. */
export const PLAN_NOTE_KIND = {
  /** A recipe the data has no place for (a world drop, or new in Forever). */
  noSource: "noSource",
  /** A rank or recipe needs a higher character level than you've set. */
  level: "level",
  /** A recipe needs more skill than your goal for its profession. */
  skill: "skill",
  /** Something is already done (a recipe you start with). */
  done: "done",
  /** Some costs aren't known (a material with no auction price). */
  price: "price",
  /** More than two main professions: Classic allows two. */
  tooMany: "tooMany",
} as const;
export type PlanNoteKind = (typeof PLAN_NOTE_KIND)[keyof typeof PLAN_NOTE_KIND];
