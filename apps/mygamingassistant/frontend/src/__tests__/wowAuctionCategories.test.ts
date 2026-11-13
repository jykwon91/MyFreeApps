import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_AUCTION_FILTERS } from "@/games/wow-forever/data/auctionHouse/noAuctionFilters";
import { categoryFilterActive, describeActiveFilters, removalPatch } from "@/games/wow-forever/lib/auctionHouse/auctionActiveFilters";
import { filtersFromParams, writeFiltersToParams } from "@/games/wow-forever/lib/auctionHouse/auctionFilterParams";
import { decodeItemCategories } from "@/games/wow-forever/lib/auctionHouse/decodeItemCategories";
import { inCategory, knownSubcategory, subcategoryLabel } from "@/games/wow-forever/lib/auctionHouse/itemCategoryLookup";
import { filterAuctionItems } from "@/games/wow-forever/prices/auctionSearch";
import type { AuctionFilterContext } from "@/games/wow-forever/types/auctionHouse/auctionFilterContext";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import {
  ELIXIR,
  FIXTURE_CATEGORIES_FILE,
  fixtureCategories,
  HELM,
  JUNK,
  LINEN_CLOTH,
  PEACEBLOOM,
  POTION,
  WOOL_CLOTH,
} from "@/__tests__/wowItemCategoriesFixture";

const UNLISTED = 99999999;

function price(itemId: number, name: string): AuctionPrice {
  return { itemId, name, marketValue: 100, minBuyout: 100, quantity: 10, listings: 3 };
}

const ITEMS: AuctionPrice[] = [
  price(POTION, "Major Healing Potion"),
  price(ELIXIR, "Elixir of Giants"),
  price(LINEN_CLOTH, "Linen Cloth"),
  price(WOOL_CLOTH, "Wool Cloth"),
  price(PEACEBLOOM, "Peacebloom"),
  price(JUNK, "Broken Tooth"),
  price(HELM, "Test Helm"),
  price(UNLISTED, "Quest Thing"),
];

function filters(over: Partial<AuctionFilters>): AuctionFilters {
  return { ...NO_AUCTION_FILTERS, ...over };
}

function context(over: Partial<AuctionFilterContext> = {}): AuctionFilterContext {
  return { qualityOf: () => null, gear: null, categories: fixtureCategories(), bisPicks: null, classId: "mage", ...over };
}

function ids(over: Partial<AuctionFilters>, ctx = context()): number[] {
  return filterAuctionItems(ITEMS, filters(over), ctx).map((i) => i.itemId);
}

describe("decodeItemCategories", () => {
  const index = fixtureCategories();

  it("files each item under its category and subclass, and gear with no subclass", () => {
    expect(index.placeOf.get(POTION)).toEqual({ category: "consumable", subclass: 1 });
    expect(index.placeOf.get(PEACEBLOOM)).toEqual({ category: "trade-goods", subclass: 9 });
    expect(index.placeOf.get(JUNK)).toEqual({ category: "misc", subclass: 0 });
    expect(index.placeOf.get(HELM)).toEqual({ category: "gear", subclass: null });
    expect(index.placeOf.get(UNLISTED)).toBeUndefined();
  });

  it("lists each category's subclasses in the game's order, named", () => {
    expect(index.subclasses.get("consumable")).toEqual([
      { id: 1, label: "Potions" },
      { id: 2, label: "Elixirs" },
    ]);
    expect(index.subclasses.get("trade-goods")).toEqual([
      { id: 5, label: "Cloth" },
      { id: 9, label: "Herb" },
    ]);
    expect(index.subclasses.has("gear")).toBe(false);
    expect(index.subclasses.has("recipe")).toBe(false);
  });

  it("sorts subclasses by id even when the file lists them out of order", () => {
    const file = { ...FIXTURE_CATEGORIES_FILE, items: { "7.9": [PEACEBLOOM], "7.5": [LINEN_CLOTH] } };
    expect(decodeItemCategories(file).subclasses.get("trade-goods")?.map((s) => s.id)).toEqual([5, 9]);
  });

  it("ignores a class the page has no category for and a key it cannot read", () => {
    const file = { ...FIXTURE_CATEGORIES_FILE, items: { "12.0": [5], bad: [6], "0.1": [POTION] } };
    expect([...decodeItemCategories(file).placeOf.keys()]).toEqual([POTION]);
  });
});

describe("inCategory / subcategoryLabel", () => {
  const index = fixtureCategories();

  it("matches the category, and the subclass when one is chosen", () => {
    expect(inCategory(POTION, filters({ category: "consumable" }), index)).toBe(true);
    expect(inCategory(POTION, filters({ category: "consumable", subcategory: 1 }), index)).toBe(true);
    expect(inCategory(POTION, filters({ category: "consumable", subcategory: 2 }), index)).toBe(false);
    expect(inCategory(POTION, filters({ category: "trade-goods" }), index)).toBe(false);
  });

  it("counts an item the file does not list as Miscellaneous, in no subclass", () => {
    expect(inCategory(UNLISTED, filters({ category: "misc" }), index)).toBe(true);
    expect(inCategory(UNLISTED, filters({ category: "misc", subcategory: 0 }), index)).toBe(false);
    expect(inCategory(UNLISTED, filters({ category: "consumable" }), index)).toBe(false);
  });

  it("treats a subclass the category does not have as all of the category", () => {
    expect(knownSubcategory(index, "consumable", 1)).toBe(1);
    expect(knownSubcategory(index, "consumable", 99)).toBeNull();
    expect(knownSubcategory(index, "consumable", null)).toBeNull();
    expect(inCategory(POTION, filters({ category: "consumable", subcategory: 99 }), index)).toBe(true);
    expect(inCategory(UNLISTED, filters({ category: "misc", subcategory: 99 }), index)).toBe(true);
  });

  it("names a subclass, or null when the category has none like it", () => {
    expect(subcategoryLabel(index, "consumable", 1)).toBe("Potions");
    expect(subcategoryLabel(index, "consumable", 9)).toBeNull();
    expect(subcategoryLabel(index, "gear", 1)).toBeNull();
  });
});

describe("filterAuctionItems with a category", () => {
  it("narrows to one category", () => {
    expect(ids({ category: "consumable" })).toEqual([POTION, ELIXIR]);
    expect(ids({ category: "trade-goods" })).toEqual([LINEN_CLOTH, WOOL_CLOTH, PEACEBLOOM]);
    expect(ids({ category: "gear" })).toEqual([HELM]);
  });

  it("narrows to one subclass", () => {
    expect(ids({ category: "consumable", subcategory: 1 })).toEqual([POTION]);
    expect(ids({ category: "trade-goods", subcategory: 9 })).toEqual([PEACEBLOOM]);
  });

  it("lists the whole category for a subclass it does not have, never an empty list", () => {
    expect(ids({ category: "consumable", subcategory: 99 })).toEqual([POTION, ELIXIR]);
  });

  it("puts items the file does not list under Miscellaneous", () => {
    expect(ids({ category: "misc" })).toEqual([JUNK, UNLISTED]);
  });

  it("does not apply until the categories have loaded", () => {
    expect(ids({ category: "consumable" }, context({ categories: null }))).toHaveLength(ITEMS.length);
  });

  it("combines with the other filters", () => {
    expect(ids({ category: "trade-goods", query: "cloth" })).toEqual([LINEN_CLOTH, WOOL_CLOTH]);
  });
});

describe("category URL params", () => {
  const parse = (qs: string) => filtersFromParams(new URLSearchParams(qs));

  it("reads a category and subclass", () => {
    expect(parse("cat=consumable&sub=1")).toMatchObject({ category: "consumable", subcategory: 1 });
    expect(parse("cat=trade-goods")).toMatchObject({ category: "trade-goods", subcategory: null });
  });

  it("drops a category that is not allowed", () => {
    expect(parse("cat=weapons&sub=1")).toMatchObject({ category: null, subcategory: null });
    expect(parse("cat=CONSUMABLE")).toMatchObject({ category: null });
  });

  it("drops a subclass that is not a small whole number, has no category, or belongs to gear", () => {
    expect(parse("cat=consumable&sub=abc")).toMatchObject({ subcategory: null });
    expect(parse("cat=consumable&sub=-1")).toMatchObject({ subcategory: null });
    expect(parse("cat=consumable&sub=1.5")).toMatchObject({ subcategory: null });
    expect(parse("cat=consumable&sub=100")).toMatchObject({ subcategory: null });
    expect(parse("sub=1")).toMatchObject({ category: null, subcategory: null });
    expect(parse("cat=gear&sub=1")).toMatchObject({ category: "gear", subcategory: null });
    expect(parse("cat=consumable&sub=0")).toMatchObject({ subcategory: 0 });
  });

  it("writes them, leaving defaults and other params alone, and round-trips", () => {
    const on = parse("q=potion&cat=consumable&sub=1&quality=rare");
    const params = writeFiltersToParams(new URLSearchParams("house=neutral"), on);
    expect(params.get("house")).toBe("neutral");
    expect(params.get("q")).toBe("potion");
    expect(params.get("cat")).toBe("consumable");
    expect(params.get("sub")).toBe("1");
    expect(filtersFromParams(params)).toMatchObject({ category: "consumable", subcategory: 1, qualities: ["rare"] });
    const cleared = writeFiltersToParams(params, { ...on, category: null, subcategory: null, qualities: [] });
    expect(cleared.toString()).toBe("house=neutral&q=potion");
  });

  it("leaves a stale subclass out when there is no category", () => {
    const params = writeFiltersToParams(new URLSearchParams(), filters({ category: null, subcategory: 3 }));
    expect(params.toString()).toBe("");
  });
});

describe("category active filter", () => {
  it("names the category, then the subclass once the categories are loaded", () => {
    const on = filters({ category: "consumable", subcategory: 1 });
    expect(describeActiveFilters(on, "Mage", null, 60).map((f) => f.label)).toEqual(["Category: Consumable"]);
    expect(describeActiveFilters(on, "Mage", fixtureCategories(), 60).map((f) => f.label)).toEqual(["Category: Potions"]);
    expect(describeActiveFilters(filters({ category: "trade-goods" }), "Mage", fixtureCategories(), 60).map((f) => f.label)).toEqual([
      "Category: Trade Goods",
    ]);
  });

  it("falls back to the category name for a subclass the category does not have", () => {
    const labels = describeActiveFilters(filters({ category: "consumable", subcategory: 77 }), "Mage", fixtureCategories(), 60).map((f) => f.label);
    expect(labels).toEqual(["Category: Consumable"]);
  });

  it("removing it clears the subclass too", () => {
    const on = filters({ category: "consumable", subcategory: 1 });
    expect({ ...on, ...removalPatch("category") }).toMatchObject({ category: null, subcategory: null });
  });

  it("knows when a filter needs the categories", () => {
    expect(categoryFilterActive(filters({ category: "recipe" }))).toBe(true);
    expect(categoryFilterActive(filters({ subcategory: 2 }))).toBe(false);
  });
});

describe("loadItemCategories", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function freshLoader() {
    vi.resetModules();
    return (await import("@/games/wow-forever/lib/itemCategoriesLoader")).loadItemCategories;
  }

  it("fetches and decodes the file once, however often it is asked for", async () => {
    const fetchJson = vi.fn().mockResolvedValue({ ok: true, json: async () => FIXTURE_CATEGORIES_FILE });
    vi.stubGlobal("fetch", fetchJson);
    const load = await freshLoader();
    const [first, second] = await Promise.all([load(), load()]);
    expect(first).toBe(second);
    expect(first.placeOf.get(POTION)).toEqual({ category: "consumable", subclass: 1 });
    await load();
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("forgets a failed load so the next call tries again", async () => {
    const fetchJson = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({ ok: true, json: async () => FIXTURE_CATEGORIES_FILE });
    vi.stubGlobal("fetch", fetchJson);
    const load = await freshLoader();
    await expect(load()).rejects.toThrow("HTTP 503");
    expect((await load()).placeOf.size).toBeGreaterThan(0);
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });
});
