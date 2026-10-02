import { describe, expect, it } from "vitest";
import { FOODS } from "@/games/wow-forever/data/food/foodData";
import { reagentSourcesFor, recipeSourcesFor } from "@/games/wow-forever/data/food/recipeSourceData";
import {
  describeRareDrop,
  directionsHref,
  getItSummary,
  isRareDrop,
  skillLine,
  splitVendors,
  unknownSource,
} from "@/games/wow-forever/food/recipeSources";
import type { FoodRecord } from "@/games/wow-forever/types/food";
import type { DropSource, VendorSpot } from "@/games/wow-forever/types/recipeSources";

function food(name: string): FoodRecord {
  const found = FOODS.find((f) => f.name === name);
  if (!found) throw new Error(name);
  return found;
}

function vendor(name: string, faction: VendorSpot["faction"], zoneId = 1453): VendorSpot {
  return { npcId: name.length, name, title: "", zoneId, zoneName: "Z", subzone: "", x: 1, y: 2, faction, limited: false };
}

const DROP: DropSource = { world: false, levels: [10, 30], mobs: [], more: 0, zones: ["The Barrens"] };

describe("splitVendors", () => {
  it("lists your faction and neutral, your zone first, and keeps the other faction apart", () => {
    const { yours, other } = splitVendors(
      [vendor("Horde guy", "H"), vendor("Neutral", "N"), vendor("Far ally", "A", 1), vendor("Near ally", "A", 7)],
      "A",
      7,
    );
    expect(yours.map((v) => v.name)).toEqual(["Near ally", "Far ally", "Neutral"]);
    expect(other.map((v) => v.name)).toEqual(["Horde guy"]);
  });
});

describe("skillLine", () => {
  it("names learn, green and grey", () => {
    expect(skillLine(75, 115, 155)).toBe("Cooking 75 to learn · green at 115 · grey at 155");
  });
  it("skips colours that don't sit above the learn skill", () => {
    expect(skillLine(275, 275, 305)).toBe("Cooking 275 to learn · grey at 305");
    expect(skillLine(300, 1, 1)).toBe("Cooking 300 to learn");
  });
});

describe("drops", () => {
  it("calls a drop under 1% rare", () => {
    expect(isRareDrop({ ...DROP, mobs: [{ name: "a", minLevel: 1, maxLevel: 2, chance: 0.1, spot: null }] })).toBe(true);
    expect(isRareDrop({ ...DROP, mobs: [{ name: "a", minLevel: 1, maxLevel: 2, chance: 30, spot: null }] })).toBe(false);
    expect(describeRareDrop({ ...DROP, world: true })).toBe("World drop from mobs level 10–30, mostly in The Barrens");
  });
});

describe("directionsHref", () => {
  it("opens the World Map with directions to the spot", () => {
    expect(directionsHref({ zoneId: 1453, x: 77.5, y: 52.7 })).toBe("/wow-forever/map?to=pt%3A1453%2C77.5%2C52.7&dir=1");
  });
});

describe("getItSummary", () => {
  it("names the vendor for a bought recipe", () => {
    const stew = food("Westfall Stew");
    expect(getItSummary(stew, recipeSourcesFor(stew.id), "A", null)).toBe(
      "Buy the recipe from Kendor Kabonka in Stormwind City.",
    );
  });
  it("points trainer recipes at a trainer", () => {
    const clams = food("Goblin Deviled Clams");
    expect(getItSummary(clams, recipeSourcesFor(clams.id), "H", null)).toBe("Learn it from any Cooking trainer.");
  });
  it("calls a sub-1% recipe drop rare", () => {
    const savory = food("Savory Deviate Delight");
    expect(getItSummary(savory, recipeSourcesFor(savory.id), "H", null)).toMatch(/^Rare drop from mobs level 10–30/);
  });
  it("says a Forever-only recipe's source isn't known", () => {
    const bruscitti = food("Bear Bruscitti");
    expect(getItSummary(bruscitti, recipeSourcesFor(bruscitti.id), "A", null)).toBe(
      "New in Forever — where to get the recipe isn't known yet.",
    );
  });
});

describe("recipe source data", () => {
  it("decodes vendors with their zone names", () => {
    const [kendor] = recipeSourcesFor(food("Westfall Stew").id).vendors;
    expect(kendor).toMatchObject({ name: "Kendor Kabonka", zoneName: "Stormwind City", x: 77.5, y: 52.7, faction: "A" });
  });
  it("knows a clam holds Clam Meat", () => {
    expect(reagentSourcesFor(5503).containers).toContain("Small Barnacled Clam");
  });
  it("has nothing for an unknown item", () => {
    expect(recipeSourcesFor(1)).toEqual({ vendors: [], quests: [], drop: null, skinning: null, disenchant: null, fishing: [], containers: [] });
  });
  it("explains unknown Classic and Forever items differently", () => {
    expect(unknownSource(250000, "it")).toMatch(/^New in Forever/);
    expect(unknownSource(17201, "it")).toMatch(/Classic data/);
  });
});
