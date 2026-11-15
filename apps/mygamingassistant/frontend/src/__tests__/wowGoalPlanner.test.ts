import { beforeAll, describe, expect, it } from "vitest";
import { loadCraftingData } from "@/games/wow-forever/crafting/loadCraftingData";
import { assignTaught } from "@/games/wow-forever/lib/goalPlanner/assignTaught";
import { buildGoalPlan } from "@/games/wow-forever/lib/goalPlanner/buildGoalPlan";
import { combinedShopping } from "@/games/wow-forever/lib/goalPlanner/combinedShopping";
import { formatGoalsParam, formatRecipesParam, parseGoalsParam, parseRecipesParam } from "@/games/wow-forever/lib/goalPlanner/goalParams";
import { orderPhase } from "@/games/wow-forever/lib/goalPlanner/orderStops";
import { recipeGoal } from "@/games/wow-forever/lib/goalPlanner/recipeStops";
import { routeThereHref } from "@/games/wow-forever/lib/goalPlanner/routeThereHref";
import { PLAN_NOTE_KIND } from "@/games/wow-forever/types/goalPlanner/planNoteKind";
import { PLAN_STOP_KIND } from "@/games/wow-forever/types/goalPlanner/planStopKind";
import { RECIPE_CATEGORY } from "@/games/wow-forever/types/recipes/recipeCategory";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import { ENDPOINT_KIND, type Endpoint } from "@/games/wow-forever/worldMap/trip";
import type { CraftingProfession, LearnAt } from "@/games/wow-forever/types/crafting";
import type { CraftingData } from "@/games/wow-forever/types/craftingData";
import type { GoalPlan } from "@/games/wow-forever/types/goalPlanner/goalPlan";
import type { PlanStop } from "@/games/wow-forever/types/goalPlanner/planStop";
import type { ProfessionPlan } from "@/games/wow-forever/types/goalPlanner/professionPlan";
import type { StopOption } from "@/games/wow-forever/types/goalPlanner/stopOption";
import type { TravelModel } from "@/games/wow-forever/types/goalPlanner/travelModel";
import type { ItemSources, VendorSpot } from "@/games/wow-forever/types/recipeSources";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

/** A flat world: zones sit 1000 apart, travel is straight-line, zone -1 can't be placed and zone -2 can't be reached. */
interface GridPlace {
  zone: number;
  x: number;
  y: number;
}

const UNPLACEABLE_ZONE = -1;
const UNREACHABLE_ZONE = -2;
const ZONE_SPACING = 1000;

function distance(a: GridPlace, b: GridPlace): number {
  return Math.hypot(a.x - b.x, a.y - b.y) + Math.abs(a.zone - b.zone) * ZONE_SPACING;
}

const GRID: TravelModel<GridPlace> = {
  at: (option) => (option.zoneId === UNPLACEABLE_ZONE ? null : { zone: option.zoneId ?? 0, x: option.x, y: option.y }),
  estimate: distance,
  travel: (from, to) => (to.zone === UNREACHABLE_ZONE ? null : { seconds: distance(from, to), yards: distance(from, to), summary: "walk" }),
};

const START: GridPlace = { zone: 0, x: 0, y: 0 };
const gridEndpoint = (p: GridPlace): Endpoint => ({ kind: ENDPOINT_KIND.point, zoneId: p.zone, x: p.x, y: p.y });

function option(key: string, zoneId: number, x: number, y = 0): StopOption {
  return { key, name: key, where: "Somewhere", npcId: null, poiId: null, zoneId, x, y };
}

function stop(id: string, options: StopOption[], extra: Partial<PlanStop> = {}): PlanStop {
  return {
    id,
    kind: PLAN_STOP_KIND.rank,
    title: id,
    detail: "",
    profession: "tailoring",
    phase: 0,
    skill: null,
    learnSkill: null,
    level: null,
    options,
    teaches: [],
    itemId: null,
    cost: null,
    ...extra,
  };
}

function vendor(npcId: number, faction: VendorSpot["faction"]): VendorSpot {
  return { npcId, name: `Vendor ${npcId}`, title: "Supplies", zoneId: 12, zoneName: "Elwynn Forest", subzone: "Goldshire", x: 40, y: 60, faction, limited: false, stock: 0, restockMinutes: 0 };
}

function sources(vendors: VendorSpot[], price: number | null): ItemSources {
  return { vendors, price, quests: [], drop: null, skinning: null, disenchant: null, fishing: [], containers: [], objectSpots: [], containerDrops: [] };
}

function recipeEntry(key: string, learn: LearnAt, extra: Partial<RecipeEntry> = {}): RecipeEntry {
  const [profession] = key.split(":");
  return {
    key,
    profession: profession as RecipeEntry["profession"],
    name: `Recipe ${key}`,
    icon: null,
    makes: null,
    category: RECIPE_CATEGORY.other,
    skill: "skill" in learn ? learn.skill : 1,
    yellow: null,
    green: null,
    grey: null,
    reagents: [],
    learn,
    recipeSources: null,
    sourceUnknown: false,
    spec: null,
    searchName: key,
    nameWords: [],
    recipeItemWords: [],
    reagentWords: [],
    ...extra,
  };
}

function shoppingPlan(profession: ProfessionPlan["profession"], counted: boolean, lines: ProfessionPlan["shopping"], unit: number | null): ProfessionPlan {
  return {
    profession,
    label: profession,
    from: 1,
    to: 75,
    rows: [],
    cost: 0,
    costUnknown: false,
    stops: [],
    shopping: lines,
    counted,
    notes: [],
    unitPrice: unit === null ? null : () => ({ price: unit, missing: [] }),
  };
}

describe("buildGoalPlan — several professions in one plan", () => {
  const crafting = new Map<CraftingProfession, CraftingData>();
  let plan: GoalPlan;

  beforeAll(async () => {
    crafting.set("tailoring", await loadCraftingData("tailoring"));
    crafting.set("enchanting", await loadCraftingData("enchanting"));
    plan = buildGoalPlan<GridPlace>({
      goals: {
        professions: [
          { profession: "tailoring", current: 0, target: 225 },
          { profession: "enchanting", current: 0, target: 225 },
          { profession: "cooking", current: 0, target: 150 },
        ],
        recipes: [],
      },
      crafting,
      recipeBook: [],
      auction: null,
      overrides: {},
      knownFormulas: {},
      excludedSlots: new Set(),
      faction: FACTION.alliance,
      level: 60,
      auctioneers: [option("Auctioneer", 0, 3)],
      model: GRID,
      start: START,
      endpointOf: gridEndpoint,
    });
  }, 60_000);

  it("plans every profession, in picker order, and starts with what you can do right away", () => {
    expect(plan.professions.map((p) => p.profession)).toEqual(["enchanting", "tailoring", "cooking"]);
    expect(plan.phases[0].title).toBe("Start");
    expect(plan.phases[0].when).toBe("Right away");
    expect(plan.phases.slice(1).every((p, i) => p.title === `Trip ${i + 2}`)).toBe(true);
    expect(plan.unplaced).toEqual([]);
  });

  it("puts each profession's Apprentice visit and the auction house on the first trip", () => {
    const first = plan.phases[0].stops.map((s) => s.stop);
    for (const profession of ["tailoring", "enchanting", "cooking"] as const) {
      expect(first.some((s) => s.profession === profession && s.kind === PLAN_STOP_KIND.learn)).toBe(true);
    }
    expect(first.some((s) => s.kind === PLAN_STOP_KIND.auction)).toBe(true);
  });

  it("visits each rank trainer on a trip before any crafting that needs it", () => {
    const visitPhase = new Map<string, number>();
    plan.phases.forEach((phase) =>
      phase.stops.forEach(({ stop: s }) => {
        if (s.kind === PLAN_STOP_KIND.rank && s.profession && s.skill !== null) visitPhase.set(`${s.profession}:${s.skill}`, phase.index);
      }),
    );
    expect(visitPhase.size).toBeGreaterThan(0);
    plan.phases.forEach((phase) =>
      phase.crafting.forEach((row) => {
        for (const [key, at] of visitPhase) {
          const [profession, skill] = key.split(":");
          if (profession === row.profession && Number(skill) <= row.from) expect(at).toBeLessThanOrEqual(phase.index);
        }
      }),
    );
  });

  it("names the skills that open each later trip", () => {
    for (const phase of plan.phases.slice(1)) {
      if (phase.stops.some((s) => s.stop.kind === PLAN_STOP_KIND.rank)) expect(phase.when).toMatch(/^When .+ reaches \d+/);
    }
  });

  it("chains every stop's Route there from the stop before it", () => {
    const stops = plan.phases.flatMap((p) => p.stops);
    expect(stops[0].from).toBeNull();
    for (let i = 1; i < stops.length; i++) expect(stops[i].from).toEqual(stops[i - 1].to);
  });

  it("merges the shopping lists with each material once", () => {
    const ids = plan.shopping.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of plan.professions) {
      for (const line of p.shopping) expect(plan.shopping.find((l) => l.id === line.id)?.professions).toContain(p.profession);
    }
    expect(plan.crafts).toBe(plan.professions.reduce((n, p) => n + p.rows.reduce((m, r) => m + (r.crafts ?? 0), 0), 0));
  });

  it("drops a goal that's already reached", () => {
    const done = buildGoalPlan<GridPlace>({
      goals: { professions: [{ profession: "tailoring", current: 225, target: 225 }], recipes: [] },
      crafting,
      recipeBook: [],
      auction: null,
      overrides: {},
      knownFormulas: {},
      excludedSlots: new Set(),
      faction: FACTION.alliance,
      level: 60,
      auctioneers: [option("Auctioneer", 0, 3)],
      model: GRID,
      start: START,
      endpointOf: gridEndpoint,
    });
    expect(done.professions).toEqual([]);
    expect(done.phases).toEqual([]);
  });
});

describe("assignTaught — trainer recipes on the right visit", () => {
  const visits = [stop("apprentice", [], { skill: 1 }), stop("journeyman", [], { skill: 50 }), stop("expert", [], { skill: 125 })];
  const fallback = () => stop("trainer", [], { kind: PLAN_STOP_KIND.learn });

  it("hangs each recipe on the last visit at or below its skill, once", () => {
    const result = assignTaught(
      visits,
      [
        { spell: 1, name: "Linen Bolt", skill: 1 },
        { spell: 2, name: "Woolen Boots", skill: 60 },
        { spell: 3, name: "Silk Bolt", skill: 125 },
        { spell: 4, name: "Mageweave Bolt", skill: 175 },
        { spell: 2, name: "Woolen Boots", skill: 60 },
      ],
      fallback,
    );
    expect(result.map((s) => s.teaches.map((t) => t.spell))).toEqual([[1], [2], [3, 4]]);
  });

  it("uses a plain trainer trip when the plan has no visits", () => {
    const result = assignTaught([], [{ spell: 9, name: "Brown Linen Robe", skill: 30 }], fallback);
    expect(result.map((s) => s.id)).toEqual(["trainer"]);
    expect(result[0].teaches.map((t) => t.spell)).toEqual([9]);
  });

  it("leaves the visits alone when there's nothing to teach", () => {
    expect(assignTaught(visits, [], fallback)).toEqual(visits);
  });
});

describe("recipeGoal — a wanted recipe becomes a stop, a trainer lesson or a note", () => {
  const trainer: LearnAt = { kind: "trainer", skill: 175, estimated: false, newInForever: false };

  it("joins the trainer visits of a profession you're leveling", () => {
    const result = recipeGoal(recipeEntry("tailoring:3914", trainer), FACTION.alliance, "Tailoring", true);
    expect(result).toEqual({ kind: "taught", profession: "tailoring", recipe: { spell: 3914, name: "Recipe tailoring:3914", skill: 175 } });
  });

  it("is its own trainer stop when you're not leveling that profession", () => {
    const result = recipeGoal(recipeEntry("tailoring:3914", trainer), FACTION.alliance, "Tailoring", false);
    expect(result.kind).toBe("stop");
    if (result.kind !== "stop") return;
    expect(result.stop.learnSkill).toBe(175);
    expect(result.stop.teaches.map((t) => t.spell)).toEqual([3914]);
    expect(result.stop.options.length).toBeGreaterThan(0);
  });

  it("buys a recipe item from a vendor your faction can use, at the vendor's price", () => {
    const learn: LearnAt = { kind: "item", skill: 115, itemId: 5772, item: "Pattern: Red Woolen Bag", estimated: false };
    const entry = recipeEntry("tailoring:6688", learn, { recipeSources: sources([vendor(1, FACTION.horde), vendor(2, FACTION.neutral)], 500) });
    const result = recipeGoal(entry, FACTION.alliance, "Tailoring", true);
    expect(result.kind).toBe("stop");
    if (result.kind !== "stop") return;
    expect(result.stop.title).toBe("Get Pattern: Red Woolen Bag");
    expect(result.stop.options.map((o) => o.npcId)).toEqual([2]);
    expect(result.stop.cost).toBe(500);
    expect(result.stop.itemId).toBe(5772);
    expect(result.stop.learnSkill).toBe(115);
  });

  it("names a quest recipe in a note instead of routing to it", () => {
    const learn: LearnAt = { kind: "quest", skill: 225, quests: [{ id: 5306, title: "Snakestone of the Shadow Huntress" }] };
    const result = recipeGoal(recipeEntry("tailoring:1", learn), FACTION.alliance, "Tailoring", true);
    expect(result.kind).toBe("note");
    if (result.kind !== "note") return;
    expect(result.note.kind).toBe(PLAN_NOTE_KIND.offRoute);
    expect(result.note.text).toContain("Snakestone of the Shadow Huntress");
  });

  it("names the one NPC who teaches a recipe in a note", () => {
    const learn: LearnAt = { kind: "npc", skill: 250, npcs: ["Lilliam Sparkspindle"] };
    const result = recipeGoal(recipeEntry("tailoring:2", learn), FACTION.alliance, "Tailoring", true);
    expect(result.kind).toBe("note");
    if (result.kind === "note") expect(result.note.text).toContain("Lilliam Sparkspindle");
  });

  it("notes a recipe only the other faction sells", () => {
    const learn: LearnAt = { kind: "item", skill: 115, itemId: 5772, item: "Pattern: Red Woolen Bag", estimated: false };
    const entry = recipeEntry("tailoring:6688", learn, { recipeSources: sources([vendor(1, FACTION.horde)], 500) });
    const result = recipeGoal(entry, FACTION.alliance, "Tailoring", true);
    expect(result.kind).toBe("note");
    if (result.kind === "note") expect(result.note.kind).toBe(PLAN_NOTE_KIND.noSource);
  });

  it("notes a recipe new in Forever with no known source", () => {
    const result = recipeGoal(recipeEntry("tailoring:99999", trainer, { sourceUnknown: true }), FACTION.alliance, "Tailoring", true);
    expect(result.kind).toBe("note");
  });
});

describe("combinedShopping — one list across professions", () => {
  it("adds counts, keeps every profession, prices from the first with a price, and skips uncounted guides", () => {
    const tailoring = shoppingPlan("tailoring", true, [{ id: 2589, name: "Linen Cloth", count: 40 }], 10);
    const enchanting = shoppingPlan("enchanting", true, [{ id: 2589, name: "Linen Cloth", count: 20 }, { id: 2996, name: "Bolt of Linen Cloth", count: 4, madeBy: "Tailoring" }], null);
    const cooking = shoppingPlan("cooking", false, [{ id: 2589, name: "Linen Cloth", count: 0 }, { id: 2672, name: "Stringy Wolf Meat", count: 0 }], null);
    const lines = combinedShopping([tailoring, enchanting, cooking]);
    const linen = lines.find((l) => l.id === 2589);
    expect(linen).toMatchObject({ count: 60, unit: 10, total: 600, professions: ["tailoring", "enchanting", "cooking"], makeWith: null });
    expect(lines.find((l) => l.id === 2996)?.makeWith).toBe("tailoring");
    expect(lines.find((l) => l.id === 2672)).toMatchObject({ count: null, total: undefined });
  });

  it("only offers 'make it with' for a profession you're leveling", () => {
    const enchanting = shoppingPlan("enchanting", true, [{ id: 2996, name: "Bolt of Linen Cloth", count: 4, madeBy: "Tailoring" }], null);
    expect(combinedShopping([enchanting])[0].makeWith).toBeNull();
  });
});

describe("orderPhase — travel order within a trip", () => {
  it("goes nearest-next, picks each stop's closest place, lists unreachable stops last and hands back unplaceable ones", () => {
    const far = stop("far", [option("far", 0, 10)]);
    const near = stop("near", [option("near", 0, 5)]);
    const either = stop("either", [option("either-a", 0, 100), option("either-b", 0, 6, 1)]);
    const lost = stop("lost", [option("lost", UNPLACEABLE_ZONE, 1)]);
    const island = stop("island", [option("island", UNREACHABLE_ZONE, 1)]);
    const result = orderPhase(START, [far, lost, island, either, near], GRID, 4);
    expect(result.stops.map((s) => s.stop.id)).toEqual(["near", "either", "far", "island"]);
    expect(result.stops[1].option.key).toBe("either-b");
    expect(result.stops[3].leg).toBeNull();
    expect(result.unplaced.map((s) => s.id)).toEqual(["lost"]);
    expect(result.end).toEqual({ zone: 0, x: 10, y: 0 });
  });
});

describe("goalParams and Route there links", () => {
  it("round-trips goals and recipes through the link and drops anything that doesn't parse", () => {
    const goals = [
      { profession: "tailoring" as const, current: 40, target: 300 },
      { profession: "cooking" as const, current: 0, target: 225 },
    ];
    expect(parseGoalsParam(formatGoalsParam(goals))).toEqual(goals);
    expect(parseGoalsParam("tailoring.40.300~tailoring.1.75~nope.1.75~cooking.0.123~enchanting.x.300")).toEqual([goals[0]]);
    expect(parseRecipesParam(formatRecipesParam(["tailoring:3914", "cooking:12210"]))).toEqual(["tailoring:3914", "cooking:12210"]);
    expect(parseRecipesParam("tailoring:3914,bogus,tailoring:3914,dance:1")).toEqual(["tailoring:3914"]);
  });

  it("links the World Map trip from the stop before, with Directions open", () => {
    const to: Endpoint = { kind: ENDPOINT_KIND.npc, poiId: "npc-1346" };
    const from: Endpoint = { kind: ENDPOINT_KIND.point, zoneId: 1519, x: 50, y: 50 };
    const href = new URL(routeThereHref(to, from, FACTION.alliance), "https://x.test");
    expect(href.pathname).toBe("/wow-forever/map");
    expect(href.searchParams.get("to")).toBe("npc:npc-1346");
    expect(href.searchParams.get("from")).toMatch(/^.*1519/);
    expect(new URL(routeThereHref(to, null, FACTION.horde), "https://x.test").searchParams.has("from")).toBe(false);
  });
});
