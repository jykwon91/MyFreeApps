import { describe, expect, it } from "vitest";
import tailoringJson from "@/games/wow-forever/data/professions/crafting/tailoring.json";
import sourcesJson from "@/games/wow-forever/data/professions/crafting/classic/sources.json";
import trainerSkillsJson from "@/games/wow-forever/data/professions/crafting/classic/trainerSkills.json";
import { createSourceLookup, type RawSourcesFile } from "@/games/wow-forever/data/sourceDecode";
import { craftContext, pricedRoute } from "@/games/wow-forever/crafting/pricedRoute";
import { priceItems } from "@/games/wow-forever/crafting/priceItems";
import { formatNet } from "@/games/wow-forever/crafting/matPrices";
import { AUCTION_CUT, MIN_PRODUCT_LISTINGS } from "@/games/wow-forever/data/auctionHouse/reagentDemandRules";
import { CRAFTING_FEATURES } from "@/games/wow-forever/data/professions/crafting/craftingFeatures";
import { CRAFT_ROUTE_MODE, type CraftRouteMode } from "@/games/wow-forever/types/craftRouteMode";
import { recipeSale } from "@/games/wow-forever/lib/auctionHouse/productSale";
import { mapPriceList } from "@/games/wow-forever/prices/auctionPrices";
import { PRICE_COLUMNS } from "@/test/auctionPricesStub";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { CraftingData } from "@/games/wow-forever/types/craftingData";
import type { CraftingFile, CraftingProfession, CraftRecipe, TrainerSkills } from "@/games/wow-forever/types/crafting";

const file = tailoringJson as unknown as CraftingFile;
const DATA: CraftingData = {
  file,
  recipes: new Map(file.recipes.map((r) => [r.spell, r])),
  trainerSkills: (trainerSkillsJson as unknown as Record<CraftingProfession, TrainerSkills>).tailoring,
  sources: createSourceLookup(sourcesJson as unknown as RawSourcesFile),
};
const GOLD = 10_000;
const MATERIAL_PRICE = 100;
const CUT = AUCTION_CUT.alliance;

/** [item id, market value, listings] rows as one Alliance house. */
function house(rows: readonly (readonly [number, number, number])[]): AuctionPrices {
  return mapPriceList({
    region: "us",
    server: "pvp",
    faction: "alliance",
    source_updated_at: "2026-11-25T00:00:00Z",
    fetched_at: "2026-11-25T00:00:00Z",
    columns: PRICE_COLUMNS,
    items: rows.map(([id, value, listings]) => [id, value, value, listings * 3, listings, `Item ${id}`]),
  });
}

function recipeNamed(name: string): CraftRecipe {
  const found = file.recipes.find((r) => r.name === name && r.creates);
  if (!found) throw new Error(`no recipe ${name}`);
  return found;
}

/** Every material at one price, every product worth almost nothing — then the caller raises the ones it wants. */
function market(products: ReadonlyMap<number, readonly [number, number]>): AuctionPrices {
  const ctx = craftContext("tailoring", DATA);
  const none = { knownFormulas: new Set<number>(), excludedSlots: new Set<never>() };
  const items = priceItems(ctx, 1, none);
  const rows = new Map<number, readonly [number, number, number]>();
  for (const item of [...items.main, ...items.more]) rows.set(item.id, [item.id, MATERIAL_PRICE, 20]);
  for (const recipe of file.recipes) {
    if (recipe.creates && !recipe.enchant && !rows.has(recipe.creates.id)) rows.set(recipe.creates.id, [recipe.creates.id, 1, 20]);
  }
  for (const [id, [value, listings]] of products) rows.set(id, [id, value, listings]);
  return house([...rows.values()]);
}

function route(auction: AuctionPrices, mode: CraftRouteMode, start = 1) {
  return pricedRoute({
    profession: "tailoring",
    data: DATA,
    start,
    auction,
    overrides: {},
    knownFormulas: new Set(),
    excludedSlots: new Set(),
    mode,
    spec: null,
  });
}

describe("Most profit route", () => {
  const pants = recipeNamed("Brown Linen Pants");
  const rich = market(new Map([[pants.creates!.id, [500 * GOLD, 12]]]));

  it("picks the recipe whose product sells for more than its materials, so its row nets a profit", () => {
    const result = route(rich, CRAFT_ROUTE_MODE.profit);
    expect(result.shown).toBe(CRAFT_ROUTE_MODE.profit);
    const rows = result.entries.flatMap((e) => (e.kind === "craft" && e.recipe.spell === pants.spell ? [e] : []));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.cost ?? 0).toBeLessThan(0);
      expect(row.sale!.sells).toBeGreaterThan(row.sale!.materials);
    }
    expect(result.total).toBeLessThan(0);
  });

  it("is not what the cheapest route picks: that one ignores what products sell for", () => {
    const cheapest = route(rich, CRAFT_ROUTE_MODE.cheapest);
    expect(cheapest.entries.every((e) => e.kind !== "craft" || e.sale === undefined)).toBe(true);
  });

  it("keeps switches rare when every craft nets a profit: the penalty follows the size of a cost, not its sign", () => {
    const everywhere = market(new Map(file.recipes.flatMap((r) => (r.creates && !r.enchant ? [[r.creates.id, [50 * GOLD, 20] as const] as const] : []))));
    const profit = route(everywhere, CRAFT_ROUTE_MODE.profit);
    const stretches = profit.entries.filter((e) => e.kind === "craft").length;
    // A penalty that rewarded switching on a negative cost would flip recipes nearly every skill point.
    expect(stretches).toBeLessThanOrEqual(profit.reach / 4);
  });

  it("counts an unlisted product as selling for nothing, and says so", () => {
    const sale = recipeSale(pants, house([]).byId, CUT);
    expect(sale).toEqual({ sells: 0, gap: "none", onSale: 0 });
  });

  it("counts a product with fewer than the minimum listings as selling for nothing, flagged thin", () => {
    const id = pants.creates!.id;
    const thin = recipeSale(pants, house([[id, 90 * GOLD, MIN_PRODUCT_LISTINGS - 1]]).byId, CUT);
    expect(thin.sells).toBe(0);
    expect(thin.gap).toBe("thin");
    const enough = recipeSale(pants, house([[id, 90 * GOLD, MIN_PRODUCT_LISTINGS]]).byId, CUT);
    expect(enough.gap).toBeNull();
    expect(enough.sells).toBe(Math.floor(90 * GOLD * pants.creates!.count * (1 - CUT)));
  });

  it("gives an enchant no sale value: it makes no item", () => {
    const enchant = { ...pants, enchant: true as const };
    expect(recipeSale(enchant, house([[pants.creates!.id, GOLD, 20]]).byId, CUT).sells).toBe(0);
  });

  it("falls back to the cheapest route when there is nothing to sell yet", () => {
    const result = route(house([]), CRAFT_ROUTE_MODE.profit);
    expect(result.canProfit).toBe(false);
    expect(result.shown).not.toBe(CRAFT_ROUTE_MODE.profit);
  });

  it("formats a profit with a plus and a cost with a tilde", () => {
    expect(formatNet(-12 * GOLD)).toMatch(/^\+12g/);
    expect(formatNet(12 * GOLD)).toMatch(/^~12g/);
  });
});

describe("which professions offer Most profit", () => {
  it("every crafting profession that makes items does; Enchanting, which makes none, does not", () => {
    const on = Object.entries(CRAFTING_FEATURES).filter(([, f]) => f.profit).map(([p]) => p);
    expect(on.sort()).toEqual(["alchemy", "blacksmithing", "engineering", "firstaid", "leatherworking", "tailoring"]);
    expect(CRAFTING_FEATURES.enchanting.profit).toBe(false);
  });
});
