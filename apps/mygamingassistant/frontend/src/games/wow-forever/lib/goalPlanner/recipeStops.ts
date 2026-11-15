/**
 * Getting a recipe: from the recipe item's sources (vendors first — cheap and
 * always there — then quest givers, then the best mobs to farm its drop), or
 * from a trainer. A recipe the data has no place for becomes a note instead.
 */
import { canBuyFrom } from "@/games/wow-forever/food/recipeSources";
import { apprenticeOptions } from "@/games/wow-forever/lib/goalPlanner/rankStops";
import { mobOption, questGiverOption, vendorOption } from "@/games/wow-forever/lib/goalPlanner/stopOptions";
import { PLAN_NOTE_KIND } from "@/games/wow-forever/types/goalPlanner/planNoteKind";
import { PLAN_STOP_KIND } from "@/games/wow-forever/types/goalPlanner/planStopKind";
import type { PlanNote } from "@/games/wow-forever/types/goalPlanner/planNote";
import type { PlanStop } from "@/games/wow-forever/types/goalPlanner/planStop";
import type { PlannerProfession } from "@/games/wow-forever/types/goalPlanner/plannerProfession";
import type { StopOption } from "@/games/wow-forever/types/goalPlanner/stopOption";
import type { TaughtRecipe } from "@/games/wow-forever/types/goalPlanner/taughtRecipe";
import type { ItemSources } from "@/games/wow-forever/types/recipeSources";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface Found {
  detail: string;
  options: StopOption[];
  /** True when bought from a vendor (the stop then costs the vendor's price). */
  bought: boolean;
}

/** Where to get a recipe item, for your faction; null when nowhere on the map is known. */
export function recipeItemPlaces(sources: ItemSources, faction: PlayerFaction): Found | null {
  const vendors = sources.vendors.filter((v) => canBuyFrom(v.faction, faction));
  if (vendors.length) return { detail: "Sold by a vendor", options: vendors.map(vendorOption), bought: true };
  const quests = sources.quests.filter((q) => canBuyFrom(q.side, faction));
  const givers = quests.flatMap((q) => q.givers.map((g, i) => ({ quest: q, option: questGiverOption(g, i) })));
  if (givers.length) {
    const titles = [...new Set(quests.map((q) => q.title))].join(" or ");
    return { detail: `Quest reward: ${titles}`, options: givers.map((g) => g.option), bought: false };
  }
  const drop = sources.drop;
  const mobs = drop && !drop.world ? drop.mobs.filter((m) => m.spot) : [];
  if (mobs.length) {
    const best = mobs[0];
    return { detail: `Drops from ${best.name} (${best.chance}% a kill)${mobs.length > 1 ? " and others" : ""}`, options: mobs.flatMap((m) => (m.spot ? [mobOption(m.name, m.spot)] : [])), bought: false };
  }
  return null;
}

/** Why a recipe item can't be placed: a world drop (with its levels), or nothing known. */
export function noPlaceReason(sources: ItemSources): string {
  const drop = sources.drop;
  if (drop?.world) return `a world drop from level ${drop.levels[0]}–${drop.levels[1]} mobs, so there's no one place to go`;
  if (sources.vendors.length || sources.quests.length) return "only the other faction sells it or gives it out";
  return "the data has no known source for it";
}

export interface RecipeItemStopInput {
  id: string;
  /** "Get Pattern: Red Woolen Bag". */
  title: string;
  profession: PlannerProfession;
  /** Skill it's learned at. */
  skill: number;
  itemId: number;
  sources: ItemSources;
  faction: PlayerFaction;
}

/** A stop to get a recipe item, or a note when there's nowhere to go for it. */
export function recipeItemStop(input: RecipeItemStopInput): PlanStop | PlanNote {
  const found = recipeItemPlaces(input.sources, input.faction);
  if (!found) return { kind: PLAN_NOTE_KIND.noSource, text: `${input.title.replace(/^Get /, "")}: ${noPlaceReason(input.sources)}.` };
  return {
    id: input.id,
    kind: PLAN_STOP_KIND.recipe,
    title: input.title,
    detail: `${found.detail}. Learn it at skill ${input.skill}.`,
    profession: input.profession,
    phase: 0,
    skill: null,
    learnSkill: input.skill,
    level: null,
    options: found.options,
    teaches: [],
    itemId: input.itemId,
    cost: found.bought ? input.sources.price : null,
  };
}

/** What a recipe goal turns into: a stop, a trainer recipe for its profession's visits, or a note. */
export type RecipeGoalResult =
  | { kind: "stop"; stop: PlanStop }
  | { kind: "taught"; profession: PlannerProfession; recipe: TaughtRecipe }
  | { kind: "note"; note: PlanNote };

/**
 * A recipe you asked for. A trainer recipe of a profession you're leveling
 * joins that profession's trainer visits; otherwise it's its own stop.
 */
export function recipeGoal(entry: RecipeEntry, faction: PlayerFaction, label: string, leveling: boolean): RecipeGoalResult {
  if (entry.sourceUnknown) {
    return { kind: "note", note: { kind: PLAN_NOTE_KIND.noSource, text: `${entry.name}: new in Forever, and where it's learned isn't known yet.` } };
  }
  const learn = entry.learn;
  if (learn.kind === "start") {
    return { kind: "note", note: { kind: PLAN_NOTE_KIND.done, text: `${entry.name}: you know it as soon as you learn ${label}.` } };
  }
  if (learn.kind === "trainer") {
    const recipe: TaughtRecipe = { spell: Number(entry.key.split(":")[1]), name: entry.name, skill: learn.skill };
    if (leveling) return { kind: "taught", profession: entry.profession, recipe };
    return {
      kind: "stop",
      stop: {
        id: `recipe-${entry.key}`,
        kind: PLAN_STOP_KIND.recipe,
        title: `Learn ${entry.name}`,
        detail: `From any ${label} trainer at skill ${learn.skill}.`,
        profession: entry.profession,
        phase: 0,
        skill: null,
        learnSkill: learn.skill,
        level: null,
        options: apprenticeOptions(entry.profession, faction),
        teaches: [recipe],
        itemId: null,
        cost: null,
      },
    };
  }
  if (learn.kind === "quest") {
    const quests = learn.quests.map((q) => q.title).join(" or ");
    return { kind: "note", note: { kind: PLAN_NOTE_KIND.offRoute, text: `${entry.name}: learned from the quest ${quests}, so it's not on the route.` } };
  }
  if (learn.kind === "npc") {
    return { kind: "note", note: { kind: PLAN_NOTE_KIND.offRoute, text: `${entry.name}: taught only by ${learn.npcs.join(" or ")}, so it's not on the route.` } };
  }
  if (!entry.recipeSources) {
    return { kind: "note", note: { kind: PLAN_NOTE_KIND.noSource, text: `${entry.name}: the data has no known source for ${learn.item}.` } };
  }
  const result = recipeItemStop({
    id: `recipe-${entry.key}`,
    title: `Get ${learn.item}`,
    profession: entry.profession,
    skill: learn.skill,
    itemId: learn.itemId,
    sources: entry.recipeSources,
    faction,
  });
  return "id" in result ? { kind: "stop", stop: result } : { kind: "note", note: result };
}
