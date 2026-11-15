/** What the plan should tell you: limits it hit, gaps in the data, and what it can't count on. */
import {
  MAIN_PROFESSION_LIMIT,
  PLANNER_PROFESSION_LABELS,
  SECONDARY_PLANNER_PROFESSIONS,
} from "@/games/wow-forever/data/goalPlanner/goalPlannerConfig";
import { CRAFTING_PROFESSION } from "@/games/wow-forever/types/crafting";
import { PLAN_NOTE_KIND } from "@/games/wow-forever/types/goalPlanner/planNoteKind";
import type { OrderedStop } from "@/games/wow-forever/types/goalPlanner/orderedStop";
import type { PlanNote } from "@/games/wow-forever/types/goalPlanner/planNote";
import type { PlanStop } from "@/games/wow-forever/types/goalPlanner/planStop";
import type { ProfessionGoal } from "@/games/wow-forever/types/goalPlanner/professionGoal";
import type { ProfessionPlan } from "@/games/wow-forever/types/goalPlanner/professionPlan";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

export interface GoalNotesInput {
  goals: readonly ProfessionGoal[];
  plans: readonly ProfessionPlan[];
  recipeNotes: readonly PlanNote[];
  wanted: readonly RecipeEntry[];
  stops: readonly OrderedStop[];
  unplaced: readonly PlanStop[];
  level: number | null;
}

function tooMany(goals: readonly ProfessionGoal[]): PlanNote[] {
  const main = goals.filter((g) => !SECONDARY_PLANNER_PROFESSIONS.has(g.profession));
  if (main.length <= MAIN_PROFESSION_LIMIT) return [];
  const names = main.map((g) => PLANNER_PROFESSION_LABELS[g.profession]).join(", ");
  return [{ kind: PLAN_NOTE_KIND.tooMany, text: `A character can have only ${MAIN_PROFESSION_LIMIT} main professions, and this plan has ${main.length} (${names}). Cooking and First Aid don't count.` }];
}

function alreadyThere(goals: readonly ProfessionGoal[]): PlanNote[] {
  return goals
    .filter((g) => g.target <= Math.max(g.current, 1))
    .map((g) => ({ kind: PLAN_NOTE_KIND.done, text: `${PLANNER_PROFESSION_LABELS[g.profession]} is already at ${g.current}, so it has nothing to do.` }));
}

function levelGates(stops: readonly OrderedStop[], level: number | null): PlanNote[] {
  if (level === null) return [];
  return stops
    .filter(({ stop }) => stop.level !== null && stop.level > level)
    .map(({ stop }) => ({ kind: PLAN_NOTE_KIND.level, text: `${stop.title} needs character level ${stop.level}; you're ${level}.` }));
}

/** A wanted recipe its profession's goal doesn't reach (or with no goal at all past where it's learned). */
function skillGaps(wanted: readonly RecipeEntry[], goals: readonly ProfessionGoal[]): PlanNote[] {
  return wanted.flatMap((entry) => {
    const goal = goals.find((g) => g.profession === entry.profession);
    const reach = goal ? Math.max(goal.target, goal.current) : 0;
    if (entry.skill <= reach) return [];
    const label = PLANNER_PROFESSION_LABELS[entry.profession];
    const why = goal ? `your ${label} goal stops at ${reach}` : `${label} isn't one of your goals`;
    return [{ kind: PLAN_NOTE_KIND.skill, text: `${entry.name} needs ${label} ${entry.skill}, but ${why}.` }];
  });
}

function priceGaps(plans: readonly ProfessionPlan[]): PlanNote[] {
  const notes: PlanNote[] = [];
  const unpriced = plans.filter((p) => p.counted && p.costUnknown).map((p) => p.label);
  if (unpriced.length) {
    notes.push({ kind: PLAN_NOTE_KIND.price, text: `Some ${unpriced.join(" and ")} materials have no auction price yet (or a stretch is "pick what you can get"), so the gold total is a floor.` });
  }
  if (plans.some((p) => !p.counted)) {
    notes.push({ kind: PLAN_NOTE_KIND.price, text: "Cooking's guide names its meats but not how many, so Cooking adds no gold or counts to the totals." });
  }
  if (plans.some((p) => p.profession === CRAFTING_PROFESSION.enchanting)) {
    notes.push({ kind: PLAN_NOTE_KIND.price, text: "Dusts and essences are priced at the auction house. Disenchanting your own crafts can cover some, but how much is luck, so the plan doesn't count on it." });
  }
  return notes;
}

export function goalNotes(input: GoalNotesInput): PlanNote[] {
  return [
    ...tooMany(input.goals),
    ...alreadyThere(input.goals),
    ...levelGates(input.stops, input.level),
    ...skillGaps(input.wanted, input.goals),
    ...input.recipeNotes,
    ...input.plans.flatMap((p) => p.notes),
    ...input.unplaced.map((s) => ({ kind: PLAN_NOTE_KIND.noSource, text: `${s.title}: the World Map can't place ${s.options.length ? "any of its NPCs" : "it"}, so it's not on the route.` })),
    ...priceGaps(input.plans),
  ];
}
