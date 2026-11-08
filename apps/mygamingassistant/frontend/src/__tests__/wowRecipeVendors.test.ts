import { describe, expect, it } from "vitest";
import { groupRecipeVendors, otherFactionOnly } from "@/games/wow-forever/lib/recipeVendors/groupRecipeVendors";
import { vendorKey } from "@/games/wow-forever/lib/recipeVendors/vendorKey";
import { nearestBuys } from "@/games/wow-forever/lib/recipeVendors/nearestBuys";
import { rankVendors } from "@/games/wow-forever/lib/recipeVendors/rankVendors";
import { playerPoint, vendorYards } from "@/games/wow-forever/lib/recipeVendors/vendorDistance";
import { distanceText, offerSummary, priceText } from "@/games/wow-forever/lib/recipeVendors/vendorText";
import { FACTION, type Faction, type PlayerFaction, type WorldZone } from "@/games/wow-forever/types/worldMap";
import type { ItemSources, VendorSpot } from "@/games/wow-forever/types/recipeSources";
import type { RecipeBuy } from "@/games/wow-forever/types/recipeVendors/recipeBuy";
import type { VendorPlace } from "@/games/wow-forever/types/recipeVendors/vendorPlace";
import type { VendorRecipe } from "@/games/wow-forever/types/recipeVendors/vendorRecipe";
import sourcesJson from "@/games/wow-forever/data/professions/crafting/classic/sources.json";
import tailoringJson from "@/games/wow-forever/data/professions/crafting/tailoring.json";
import { craftVendorRecipes } from "@/games/wow-forever/lib/recipeVendors/collectVendorRecipes";
import { routeBuys, routeRecipeItems } from "@/games/wow-forever/lib/recipeVendors/routeBuys";
import { createSourceLookup, type RawSourcesFile } from "@/games/wow-forever/data/sourceDecode";
import { FOOD_SOURCES } from "@/games/wow-forever/data/food/recipeSourceData";
import { FOODS } from "@/games/wow-forever/data/food/foodData";
import { COOKING_ROUTE } from "@/games/wow-forever/data/professions/cooking";
import type { CraftingFile } from "@/games/wow-forever/types/crafting";

// Two zones side by side on one continent (1000 yd apart, middle to middle) and one on another continent.
const WEST = 10;
const EAST = 20;
const KALIMDOR_ZONE = 30;

function zone(id: number, continent: number, bounds: WorldZone["bounds"]): WorldZone {
  return { id, name: `Zone ${id}`, kind: "zone", continent, parent: continent, bounds };
}

const ZONES: ReadonlyMap<number, WorldZone> = new Map([
  [WEST, zone(WEST, 0, [0, 1000, 1000, 2000])],
  [EAST, zone(EAST, 0, [0, 1000, 0, 1000])],
  [KALIMDOR_ZONE, zone(KALIMDOR_ZONE, 1, [0, 1000, 0, 1000])],
]);

function spot(npcId: number, name: string, faction: Faction, zoneId: number, x = 50, y = 50, stock = 0): VendorSpot {
  return {
    npcId,
    name,
    title: "Trade Supplies",
    zoneId,
    zoneName: `Zone ${zoneId}`,
    subzone: "",
    x,
    y,
    faction,
    limited: stock > 0,
    stock,
    restockMinutes: stock > 0 ? 60 : 0,
  };
}

// Alliance vendor where you stand; a neutral goblin 1000 yd east; a limited-stock neutral 100 yd south;
// an Alliance vendor across the sea; a Horde-only vendor.
const HERE_ALLIANCE = spot(1, "Ada", FACTION.alliance, WEST);
const GOBLIN = spot(2, "Gizmo", FACTION.neutral, EAST);
const LIMITED = spot(3, "Lim", FACTION.neutral, WEST, 50, 60, 1);
const OVERSEAS = spot(4, "Kal", FACTION.alliance, KALIMDOR_ZONE);
const HORDE = spot(5, "Hrok", FACTION.horde, WEST);

function place(faction: PlayerFaction, zoneId: number | null, position: { x: number; y: number } | null = null): VendorPlace {
  return { faction, here: playerPoint(ZONES, zoneId, position), zoneById: ZONES };
}

function recipe(itemId: number, vendors: VendorSpot[], onRoute = false, skill: number | null = 100): VendorRecipe {
  return { itemId, name: `Recipe ${itemId}`, skill, price: 5000, onRoute, vendors };
}

function sources(vendors: VendorSpot[]): ItemSources {
  return {
    vendors,
    price: 5000,
    quests: [],
    drop: null,
    skinning: null,
    disenchant: null,
    fishing: [],
    containers: [],
    objectSpots: [],
    containerDrops: [],
  };
}

function buy(itemId: number, vendors: VendorSpot[]): RecipeBuy {
  return { itemId, name: `Recipe ${itemId}`, sources: sources(vendors) };
}

describe("vendor distance", () => {
  it("stands you in the middle of your zone until you set a spot, and nowhere without a zone", () => {
    expect(playerPoint(ZONES, null, null)).toBeNull();
    expect(playerPoint(ZONES, 999, null)).toBeNull();
    expect(vendorYards(HERE_ALLIANCE, place(FACTION.alliance, WEST))).toBe(0);
    expect(vendorYards(HERE_ALLIANCE, place(FACTION.alliance, WEST, { x: 50, y: 40 }))).toBeCloseTo(100);
  });

  it("measures straight-line yards on your continent and Infinity across the sea", () => {
    const here = place(FACTION.alliance, WEST);
    expect(vendorYards(GOBLIN, here)).toBeCloseTo(1000);
    expect(vendorYards(LIMITED, here)).toBeCloseTo(100);
    expect(vendorYards(OVERSEAS, here)).toBe(Number.POSITIVE_INFINITY);
    expect(vendorYards(GOBLIN, place(FACTION.alliance, null))).toBeNull();
  });
});

describe("rankVendors", () => {
  it("keeps your faction's and neutral vendors, nearest first, other continent last", () => {
    const { yours, other } = rankVendors([OVERSEAS, GOBLIN, HORDE, LIMITED, HERE_ALLIANCE], place(FACTION.alliance, WEST));
    expect(yours.map((n) => n.vendor.name)).toEqual(["Ada", "Lim", "Gizmo", "Kal"]);
    expect(other.map((n) => n.vendor.name)).toEqual(["Hrok"]);
  });

  it("puts a vendor in a zone the map can't place after every vendor with a known distance", () => {
    const unmapped = spot(6, "Aaron", FACTION.alliance, 999);
    const { yours } = rankVendors([unmapped, OVERSEAS, GOBLIN, HERE_ALLIANCE], place(FACTION.alliance, WEST));
    expect(yours.map((n) => n.vendor.name)).toEqual(["Ada", "Gizmo", "Kal", "Aaron"]);
    expect(yours[yours.length - 1]?.yards).toBeNull();
  });

  it("without a location puts your own faction's vendors before neutral ones, then by name", () => {
    const { yours } = rankVendors([GOBLIN, OVERSEAS, LIMITED, HERE_ALLIANCE], place(FACTION.alliance, null));
    expect(yours.map((n) => n.vendor.name)).toEqual(["Ada", "Kal", "Gizmo", "Lim"]);
    expect(yours.every((n) => n.yards === null)).toBe(true);
  });

  it("a Horde player can't use the Alliance vendors but can use the goblins", () => {
    const { yours, other } = rankVendors([HERE_ALLIANCE, GOBLIN, HORDE], place(FACTION.horde, WEST));
    expect(yours.map((n) => n.vendor.name)).toEqual(["Hrok", "Gizmo"]);
    expect(other.map((n) => n.vendor.name)).toEqual(["Ada"]);
  });
});

describe("nearestBuys", () => {
  it("picks the vendor on your continent for a recipe sold on both continents", () => {
    const [line] = nearestBuys([buy(1, [OVERSEAS, GOBLIN])], place(FACTION.alliance, WEST));
    expect(line.kind === "vendor" && line.near.vendor.name).toBe("Gizmo");
    const [kalimdor] = nearestBuys([buy(1, [OVERSEAS, GOBLIN])], place(FACTION.alliance, KALIMDOR_ZONE));
    expect(kalimdor.kind === "vendor" && kalimdor.near.vendor.name).toBe("Kal");
  });

  it("puts the nearest recipe first, a faction-only recipe last, and drops one no vendor sells", () => {
    const lines = nearestBuys([buy(1, [GOBLIN]), buy(2, [HORDE]), buy(3, []), buy(4, [HERE_ALLIANCE])], place(FACTION.alliance, WEST));
    expect(lines.map((l) => [l.kind, l.buy.itemId])).toEqual([
      ["vendor", 4],
      ["vendor", 1],
      ["otherFaction", 2],
    ]);
    expect(lines[2].kind === "otherFaction" && lines[2].faction).toBe(FACTION.horde);
  });

  it("keeps a limited-stock vendor's stock for the line", () => {
    const [line] = nearestBuys([buy(1, [LIMITED])], place(FACTION.alliance, WEST));
    expect(line.kind === "vendor" && line.near.vendor.limited).toBe(true);
  });
});

describe("groupRecipeVendors", () => {
  const onRoute = recipe(1, [HERE_ALLIANCE, OVERSEAS], true, 175);
  const offRoute = recipe(2, [HERE_ALLIANCE, LIMITED], false, 50);
  const hordeOnly = recipe(3, [HORDE]);
  const neutral = recipe(4, [GOBLIN]);
  const recipes = [offRoute, onRoute, hordeOnly, neutral];

  it("groups by vendor, route recipes first inside a group", () => {
    const { yours } = groupRecipeVendors(recipes, place(FACTION.alliance, WEST));
    const ada = yours.find((g) => g.vendor.name === "Ada");
    expect(ada?.offers.map((o) => o.recipe.itemId)).toEqual([1, 2]);
    expect(ada?.onRoute).toBe(1);
    expect(offerSummary(ada!)).toBe("2 recipes · 1 on your route");
  });

  it("orders vendors with route recipes first, then nearest, then the other continent", () => {
    const { yours, other } = groupRecipeVendors(recipes, place(FACTION.alliance, WEST));
    expect(yours.map((g) => g.vendor.name)).toEqual(["Ada", "Kal", "Lim", "Gizmo"]);
    expect(other.map((g) => g.vendor.name)).toEqual(["Hrok"]);
  });

  it("shows a neutral vendor to both factions", () => {
    const horde = groupRecipeVendors([neutral], place(FACTION.horde, null));
    const alliance = groupRecipeVendors([neutral], place(FACTION.alliance, null));
    expect(horde.yours.map((g) => g.vendor.name)).toEqual(["Gizmo"]);
    expect(alliance.yours.map((g) => g.vendor.name)).toEqual(["Gizmo"]);
  });

  it("marks a limited-stock offer with its stock and restock time", () => {
    const { yours } = groupRecipeVendors(recipes, place(FACTION.alliance, WEST));
    const [offer] = yours.find((g) => g.key === vendorKey(LIMITED))?.offers ?? [];
    expect(offer).toMatchObject({ limited: true, stock: 1, restockMinutes: 60 });
  });

  it("names the recipes only the other faction's vendors sell", () => {
    expect(otherFactionOnly(recipes, place(FACTION.alliance, null)).map((r) => r.itemId)).toEqual([3]);
    expect(otherFactionOnly(recipes, place(FACTION.horde, null)).map((r) => r.itemId)).toEqual([1]);
  });

  it("keeps one card per spot when the same NPC stands in two places", () => {
    const moved = { ...HERE_ALLIANCE, zoneId: EAST };
    const { yours } = groupRecipeVendors([recipe(9, [HERE_ALLIANCE, moved])], place(FACTION.alliance, WEST));
    expect(yours).toHaveLength(2);
  });
});

describe("vendor text", () => {
  it("says how far, or that it's across the sea, or nothing when unknown", () => {
    expect(distanceText(null)).toBeNull();
    expect(distanceText(Number.POSITIVE_INFINITY)).toBe("Another continent — boat or zeppelin");
    expect(distanceText(340)).toBe("~350 yd away");
  });

  it("prints prices as gold/silver/copper", () => {
    expect(priceText(null)).toBeNull();
    expect(priceText(12005)).toBe("1g 20s 5c");
  });

  it("counts recipes without a route note when none are on the route", () => {
    expect(offerSummary({ offers: [{ recipe: recipe(1, []), limited: false, stock: 0, restockMinutes: 0 }], onRoute: 0 })).toBe("1 recipe");
  });
});

describe("generated vendor data", () => {
  it("every recipe a Cooking route row has you buy is a real food that vendors sell, at a price", () => {
    const routeFoods = COOKING_ROUTE.flatMap((s) => (s.kind === "craft" ? (s.recipes ?? []) : []));
    expect(routeFoods.length).toBeGreaterThan(0);
    for (const r of routeFoods) {
      expect(FOODS.some((f) => f.id === r.id), r.name).toBe(true);
      const sources = FOOD_SOURCES.recipe(r.id);
      expect(sources.vendors.length, r.name).toBeGreaterThan(0);
      expect(sources.price, r.name).toBeGreaterThan(0);
    }
    expect(routeRecipeItems(COOKING_ROUTE, FOODS).size).toBe(routeFoods.length);
  });

  it("carries the Expert Cookbook and Expert Fishing book with their vendors and price", () => {
    for (const guide of ["cooking", "fishing"]) {
      const book = FOOD_SOURCES.book(guide);
      expect(book?.sources.vendors.length, guide).toBeGreaterThan(0);
      expect(book?.sources.price, guide).toBe(10000);
    }
    expect(FOOD_SOURCES.book("tailoring")).toBeNull();
  });

  it("names the book on the Cooking milestone that has you buy it", () => {
    const book = FOOD_SOURCES.book("cooking");
    const milestone = COOKING_ROUTE.find((s) => s.kind === "milestone" && s.buysBook);
    expect(milestone).toBeDefined();
    expect(routeBuys(milestone!, { sources: FOOD_SOURCES, book }).map((b) => b.itemId)).toEqual([book!.itemId]);
  });

  it("lists each vendor-sold Tailoring pattern once, priced, never a Forever-only item", () => {
    const sources = createSourceLookup(sourcesJson as unknown as RawSourcesFile);
    const sold = craftVendorRecipes((tailoringJson as unknown as CraftingFile).recipes, sources);
    expect(sold.length).toBeGreaterThan(10);
    expect(new Set(sold.map((r) => r.itemId)).size).toBe(sold.length);
    for (const r of sold) {
      expect(r.vendors.length, r.name).toBeGreaterThan(0);
      expect(r.price, r.name).toBeGreaterThan(0);
      expect(r.itemId, r.name).toBeLessThan(100000);
    }
  });
});
