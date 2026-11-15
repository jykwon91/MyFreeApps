import { CRAFTING_GROUP } from "@/games/wow-forever/data/professions/professionPicker";
import { PROFESSION } from "@/games/wow-forever/data/professions/professionTypes";
import { CRAFTING_PROFESSION } from "@/games/wow-forever/types/crafting";
import type { PlannerProfession } from "@/games/wow-forever/types/goalPlanner/plannerProfession";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

export const GOAL_PLANNER_PATH = "/wow-forever/goal-planner";

/** `?g=tailoring.40.300~cooking.0.300` — the profession goals. */
export const GOALS_PARAM = "g";
/** `?r=tailoring:3914,cooking:12210` — the recipes to learn. */
export const RECIPES_PARAM = "r";
export const GOAL_SEPARATOR = "~";
export const GOAL_FIELD_SEPARATOR = ".";
export const RECIPE_SEPARATOR = ",";

/** The last goals you planned, for a visit without a link. */
export const GOAL_PLANNER_STORAGE_KEY = "mga.wowForever.goalPlanner.goals.v1";

/** Every profession the planner levels, in picker order (main crafting ones, then the secondary ones). */
export const PLANNER_PROFESSIONS: readonly PlannerProfession[] = [
  ...CRAFTING_GROUP.options.map((o) => o.id),
  PROFESSION.cooking,
  CRAFTING_PROFESSION.firstaid,
];

export const PLANNER_PROFESSION_LABELS: Readonly<Record<PlannerProfession, string>> = {
  alchemy: "Alchemy",
  blacksmithing: "Blacksmithing",
  enchanting: "Enchanting",
  engineering: "Engineering",
  leatherworking: "Leatherworking",
  tailoring: "Tailoring",
  cooking: "Cooking",
  firstaid: "First Aid",
};

/** Main professions: Classic lets a character have two (crafting or gathering). */
export const MAIN_PROFESSION_LIMIT = 2;
export const SECONDARY_PLANNER_PROFESSIONS: ReadonlySet<PlannerProfession> = new Set([PROFESSION.cooking, CRAFTING_PROFESSION.firstaid]);

/** The goal skills a profession can be set to: each rank's cap. */
export const GOAL_TARGETS = [75, 150, 225, 300] as const;
export type GoalTarget = (typeof GOAL_TARGETS)[number];
export const GOAL_TARGET_LABELS: Readonly<Record<`${GoalTarget}`, string>> = {
  "75": "75 · Apprentice",
  "150": "150 · Journeyman",
  "225": "225 · Expert",
  "300": "300 · Artisan",
};
export const DEFAULT_GOAL_TARGET: GoalTarget = 300;

/** Each rank raises the cap by this much (75 Apprentice, 150 Journeyman, 225 Expert, 300 Artisan). */
export const SKILL_PER_RANK = 75;

/** The plan's first trip (everything you can do right away), then "Trip 2", "Trip 3"... one per round of new ranks. */
export const FIRST_PHASE_TITLE = "Start";
export const LATER_PHASE_TITLE = "Trip";

/** Where the route starts when you haven't set your location on the World Map: your faction's main capital. */
export const DEFAULT_START_ZONE: Readonly<Record<PlayerFaction, string>> = { A: "Stormwind City", H: "Orgrimmar" };

/** Places tried per stop when ordering the route (the nearest by straight line); each costs a route search. */
export const OPTION_CANDIDATES = 4;

/** Straight-line stand-in for a place on another continent, so it's tried after anything on this one. */
export const OTHER_CONTINENT_YARDS = 1_000_000;

/** Recipe search results shown under the box. */
export const RECIPE_RESULT_LIMIT = 8;
