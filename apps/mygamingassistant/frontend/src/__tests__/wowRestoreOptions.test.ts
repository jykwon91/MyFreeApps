import { describe, expect, it } from "vitest";
import { CONSUMABLES } from "@/games/wow-forever/data/food/consumableData";
import { FOODS } from "@/games/wow-forever/data/food/foodData";
import { reagentSourcesFor } from "@/games/wow-forever/data/food/recipeSourceData";
import { MAX_OTHER_OPTIONS, restoreChoices, usesMana, type RestoreInput } from "@/games/wow-forever/food/restoreOptions";
import { describeMage, describeWay, FREE_FROM_MAGE } from "@/games/wow-forever/food/restoreText";
import { FACTION } from "@/games/wow-forever/types/worldMap";

function input(level: number, auction: Record<number, number> = {}): RestoreInput {
  return { level, faction: FACTION.alliance, auctionCopper: (id) => auction[id], sourcesOf: reagentSourcesFor };
}

describe("restoreChoices", () => {
  it("gives a level 59 Warlock a Mage's conjured water first and real food and drink options", () => {
    const drink = restoreChoices("drink", CONSUMABLES, FOODS, input(59));
    expect(drink.mage?.way).toBe("mage");
    expect(drink.mage?.amount).toBeGreaterThanOrEqual(4200);
    expect(drink.others.length).toBeGreaterThan(0);
    expect(drink.others.length).toBeLessThanOrEqual(MAX_OTHER_OPTIONS);
    const food = restoreChoices("food", CONSUMABLES, FOODS, input(59));
    expect(food.mage?.name).toBe("Conjured Cinnamon Roll");
    expect(food.others.length).toBeGreaterThan(0);
  });

  it("keeps the two tracks apart: food restores health, drink restores mana", () => {
    const food = restoreChoices("food", CONSUMABLES, FOODS, input(45));
    const drink = restoreChoices("drink", CONSUMABLES, FOODS, input(45));
    expect(food.mage?.name).toBe("Conjured Sweet Roll");
    expect(drink.mage?.name).toBe("Conjured Sparkling Water");
    const heal = new Set(CONSUMABLES.filter((c) => c.heal && !c.mana).map((c) => c.id));
    expect(drink.others.some((o) => heal.has(o.id))).toBe(false);
  });

  it("only offers what the level can eat", () => {
    const low = restoreChoices("drink", CONSUMABLES, FOODS, input(10));
    for (const o of [low.mage, ...low.others]) if (o) expect(o.level).toBeLessThanOrEqual(10);
    expect(low.mage?.name).not.toBe("Conjured Crystal Water");
    expect(restoreChoices("drink", CONSUMABLES, FOODS, input(55)).mage?.amount).toBeGreaterThan(low.mage?.amount ?? 0);
  });

  it("lists the others free first, then by vendor price, and gives several of them", () => {
    const { others } = restoreChoices("drink", CONSUMABLES, FOODS, input(59));
    expect(others.length).toBeGreaterThanOrEqual(2);
    const rank = { drop: 0, vendor: 1, cooked: 2, mage: 3 };
    const ways = others.map((o) => rank[o.way]);
    expect(ways).toEqual([...ways].sort((a, b) => a - b));
    const bought = others.filter((o) => o.way === "vendor").map((o) => o.vendorCopper ?? 0);
    expect(bought).toEqual([...bought].sort((a, b) => a - b));
  });

  it("includes vendor food, and never repeats the Mage's conjured item among the others", () => {
    const { mage, others } = restoreChoices("food", CONSUMABLES, FOODS, input(59));
    expect(others.some((o) => o.way === "vendor" || o.way === "cooked" || o.way === "drop")).toBe(true);
    expect(others.some((o) => o.id === mage?.id)).toBe(false);
  });

  it("orders cooked food by its auction price, priced before unpriced", () => {
    const cooked = restoreChoices("food", CONSUMABLES, FOODS, input(59)).others.filter((o) => o.way === "cooked");
    const prices = Object.fromEntries(cooked.map((o, i) => [o.id, 1000 - i * 10]));
    const priced = restoreChoices("food", CONSUMABLES, FOODS, input(59, prices)).others.filter((o) => o.way === "cooked");
    const costs = priced.map((o) => prices[o.id]);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });
});

describe("usesMana", () => {
  it("gives Warriors and Rogues no drink, and every other class one", () => {
    expect(usesMana("warrior")).toBe(false);
    expect(usesMana("rogue")).toBe(false);
    for (const c of ["warlock", "mage", "priest", "druid", "hunter", "paladin", "shaman"] as const) expect(usesMana(c)).toBe(true);
  });
});

describe("restoreText", () => {
  it("marks the Mage's item free, with its Mage level when the client gives one", () => {
    const { mage } = restoreChoices("drink", CONSUMABLES, FOODS, input(45));
    expect(mage?.name).toBe("Conjured Sparkling Water");
    if (!mage) return;
    expect(describeMage(mage)).toBe(`${FREE_FROM_MAGE} · Mage level 50`);
    expect(describeMage({ ...mage, mageLevel: null })).toBe(FREE_FROM_MAGE);
  });

  it("says where to buy a vendor item and what it costs", () => {
    const { others } = restoreChoices("food", CONSUMABLES, FOODS, input(59));
    const vendor = others.find((o) => o.way === "vendor");
    expect(vendor).toBeDefined();
    if (!vendor) return;
    expect(describeWay(vendor, reagentSourcesFor(vendor.id), FACTION.alliance)).toMatch(/^Buy from .+ · /);
  });
});
