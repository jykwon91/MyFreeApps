/**
 * The rank visits a profession goal needs: Apprentice when you haven't learned
 * it, then Journeyman / Expert / Artisan for every cap the goal goes past. The
 * ranks, trainers, books and quests are the Professions guide's own data
 * (`professionRankSteps`), so the plan and the guide never disagree.
 */
import { FOOD_SOURCES } from "@/games/wow-forever/data/food/recipeSourceData";
import { SKILL_PER_RANK } from "@/games/wow-forever/data/goalPlanner/goalPlannerConfig";
import { CRAFTING_TRAINERS, type RankTrainers } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import { rankTrainers } from "@/games/wow-forever/data/professions/rankTrainers";
import { PROFESSION, type MilestoneStep, type TrainerNpc } from "@/games/wow-forever/data/professions/professionTypes";
import { CITY_TRAINERS, TOWN_TRAINERS } from "@/games/wow-forever/data/professions/trainers";
import { canBuyFrom } from "@/games/wow-forever/food/recipeSources";
import { forFaction } from "@/games/wow-forever/lib/forFaction";
import { rankSkills } from "@/games/wow-forever/lib/goalPlanner/rankSkills";
import { rankTrainerOption, trainerOption, vendorOption } from "@/games/wow-forever/lib/goalPlanner/stopOptions";
import { professionRankSteps } from "@/games/wow-forever/lib/trainers/professionRankSteps";
import { PLAN_STOP_KIND } from "@/games/wow-forever/types/goalPlanner/planStopKind";
import type { PlanStop } from "@/games/wow-forever/types/goalPlanner/planStop";
import type { PlannerProfession } from "@/games/wow-forever/types/goalPlanner/plannerProfession";
import type { ProfessionGoal } from "@/games/wow-forever/types/goalPlanner/professionGoal";
import type { StopOption } from "@/games/wow-forever/types/goalPlanner/stopOption";
import type { ProfessionRankStep } from "@/games/wow-forever/types/trainers/professionRankStep";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

const DUNGEON_NPC_PARAM = "npc";

interface Where {
  detail: string;
  options: StopOption[];
  itemId: number | null;
  cost: number | null;
}

/** Anyone who teaches Apprentice: the profession's city and town trainers. */
export function apprenticeOptions(profession: PlannerProfession, faction: PlayerFaction): StopOption[] {
  if (profession === PROFESSION.cooking) {
    const cities = CITY_TRAINERS.filter((c) => c.faction === faction).map((c) => c.cooking);
    return [...cities, ...TOWN_TRAINERS[faction].cooking].map(trainerOption);
  }
  const trainers = CRAFTING_TRAINERS[profession];
  const npcs: TrainerNpc[] = [...trainers.cities[faction].map((c) => c.npc), ...trainers.towns[faction]];
  return npcs.map(trainerOption);
}

function craftingRankWhere(trainers: RankTrainers, faction: PlayerFaction, label: string): Where {
  if (trainers.kind === "list") {
    return { detail: `From a ${label} trainer`, options: trainers.trainers[faction].map(rankTrainerOption), itemId: null, cost: null };
  }
  if (trainers.kind === "dungeon") {
    const poiId = new URL(trainers.dungeonLink, "https://x.invalid").searchParams.get(DUNGEON_NPC_PARAM);
    const option: StopOption = { key: `poi-${poiId ?? trainers.dungeon}`, name: trainers.name, where: trainers.dungeon, npcId: null, poiId, zoneId: null, x: 0, y: 0 };
    return { detail: `${trainers.name}, inside ${trainers.dungeon}. ${trainers.detail}`, options: poiId ? [option] : [], itemId: null, cost: null };
  }
  if (trainers.kind === "book") {
    return { detail: `Buy ${trainers.book} (${trainers.price}). ${trainers.trip[faction]}`, options: [trainerOption(trainers.vendors[faction])], itemId: trainers.bookItemId, cost: null };
  }
  return { detail: `Quest: ${trainers.quest}. ${trainers.detail[faction]}`, options: [trainerOption(trainers.givers[faction])], itemId: null, cost: null };
}

function milestoneNpc(milestone: MilestoneStep, faction: PlayerFaction): TrainerNpc | null {
  const npc = milestone.npc;
  if (!npc) return null;
  return "npcId" in npc ? npc : npc[faction];
}

/** A Cooking milestone: a rank's trainers, its book's vendors, or its quest giver. */
function milestoneWhere(profession: PlannerProfession, milestone: MilestoneStep, faction: PlayerFaction): Where {
  const detail = forFaction(milestone.detail, faction);
  if (milestone.teaches) {
    return { detail, options: rankTrainers(milestone.teaches.profession, milestone.teaches.rank, faction).map(rankTrainerOption), itemId: null, cost: null };
  }
  const book = milestone.buysBook ? FOOD_SOURCES.book(profession) : null;
  if (book) {
    const vendors = book.sources.vendors.filter((v) => canBuyFrom(v.faction, faction));
    return { detail, options: vendors.map(vendorOption), itemId: book.itemId, cost: book.sources.price };
  }
  const npc = milestoneNpc(milestone, faction);
  return { detail, options: npc ? [trainerOption(npc)] : [], itemId: null, cost: null };
}

function rankWhere(profession: PlannerProfession, step: ProfessionRankStep, faction: PlayerFaction, label: string): Where {
  if (step.craftingRank) return craftingRankWhere(step.craftingRank.trainers, faction, label);
  if (step.milestone) return milestoneWhere(profession, step.milestone, faction);
  return { detail: `From a ${label} trainer`, options: [], itemId: null, cost: null };
}

/** The cap a step's rank gives: its own when known, else the Classic ladder (75 per rank). */
function capOf(steps: readonly ProfessionRankStep[], index: number): number {
  return steps[index]?.cap ?? SKILL_PER_RANK * (index + 1);
}

/** The goal needs this rank: it goes past the cap of the rank before, and you aren't past that cap yet. */
function rankNeeded(goal: Pick<ProfessionGoal, "current" | "target">, previousCap: number): boolean {
  return goal.target > previousCap && goal.current <= previousCap;
}

/** Every rank visit the goal needs, in ladder order; `phase` is the rank's place on the ladder (Apprentice 0). */
export function rankStops(goal: ProfessionGoal, faction: PlayerFaction, label: string): PlanStop[] {
  const steps = professionRankSteps(goal.profession);
  const skills = rankSkills(goal.profession);
  const stops: PlanStop[] = [];
  steps.forEach((step, phase) => {
    const previousCap = phase === 0 ? 0 : capOf(steps, phase - 1);
    if (!rankNeeded(goal, previousCap)) return;
    const first = phase === 0;
    const where = first
      ? { detail: `Any ${label} trainer teaches it and your first recipes.`, options: apprenticeOptions(goal.profession, faction), itemId: null, cost: null }
      : rankWhere(goal.profession, step, faction, label);
    stops.push({
      id: `${goal.profession}-rank-${phase}`,
      kind: first ? PLAN_STOP_KIND.learn : PLAN_STOP_KIND.rank,
      title: rankTitle(goal.profession, step, label, first),
      detail: where.detail,
      profession: goal.profession,
      phase,
      skill: skills[phase],
      learnSkill: null,
      level: step.level,
      options: where.options,
      teaches: [],
      itemId: where.itemId,
      cost: where.cost,
    });
  });
  return stops;
}

function rankTitle(profession: PlannerProfession, step: ProfessionRankStep, label: string, first: boolean): string {
  if (first) return `Learn ${label}`;
  // Cooking's milestones are named for what you do ("Buy the Expert Cookbook").
  if (profession === PROFESSION.cooking && step.milestone) return step.milestone.name;
  return `Train ${step.name} ${label}`;
}

/** A trip to any of the profession's trainers, for recipes when the goal needs no new rank. */
export function trainerVisitStop(profession: PlannerProfession, faction: PlayerFaction, label: string, phase: number): PlanStop {
  return {
    id: `${profession}-trainer`,
    kind: PLAN_STOP_KIND.learn,
    title: `Visit a ${label} trainer`,
    detail: `Any ${label} trainer teaches these.`,
    profession,
    phase,
    skill: null,
    learnSkill: null,
    level: null,
    options: apprenticeOptions(profession, faction),
    teaches: [],
    itemId: null,
    cost: null,
  };
}

/** The rank at this ladder phase is trained by a trainer (who also teaches recipes), not a book or a quest. */
export function rankTrainsRecipes(profession: PlannerProfession, phase: number): boolean {
  if (phase === 0) return true;
  const step = professionRankSteps(profession)[phase];
  if (!step) return false;
  const kind = step.craftingRank?.trainers.kind;
  return kind === "list" || kind === "dungeon" || step.milestone?.teaches !== undefined;
}
