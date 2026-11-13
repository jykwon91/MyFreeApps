import { describe, expect, it } from "vitest";
import { describeActiveFilters, gearFilterActive, removalPatch } from "@/games/wow-forever/lib/auctionHouse/auctionActiveFilters";
import { auctionEmptyMessage } from "@/games/wow-forever/lib/auctionHouse/auctionEmptyMessage";
import { NO_AUCTION_FILTERS } from "@/games/wow-forever/data/auctionHouse/noAuctionFilters";
import { filtersFromParams, writeFiltersToParams } from "@/games/wow-forever/lib/auctionHouse/auctionFilterParams";
import { auctionResultsKey } from "@/games/wow-forever/lib/auctionHouse/auctionResultsKey";
import { clampToRange } from "@/games/wow-forever/lib/auctionHouse/clampToRange";
import { normalizeRange } from "@/games/wow-forever/lib/auctionHouse/normalizeRange";
import { toggleQuality } from "@/games/wow-forever/lib/auctionHouse/toggleQuality";
import { usableByClass } from "@/games/wow-forever/lib/auctionHouse/usableByClass";
import { filterAuctionItems, sortAuctionItems } from "@/games/wow-forever/prices/auctionSearch";
import type { ItemQuality } from "@/games/wow-forever/data/itemSlots";
import type { AuctionFilterContext } from "@/games/wow-forever/types/auctionHouse/auctionFilterContext";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

const G = 10_000;

function price(itemId: number, name: string, marketValue: number, quantity = 10, listings = 3, minBuyout = marketValue): AuctionPrice {
  return { itemId, name, marketValue, minBuyout, quantity, listings };
}

function gearItem(id: number, over: Partial<ClientItem>): ClientItem {
  return {
    id,
    name: `Gear ${id}`,
    quality: "uncommon",
    slot: "chest",
    itemType: "Cloth",
    itemLevel: 20,
    requiredLevel: 10,
    armor: 10,
    weapon: null,
    stats: {},
    classes: null,
    damageUnknown: false,
    otherEffects: 0,
    randomSuffix: false,
    ...over,
  };
}

const QUALITIES: Record<number, ItemQuality> = { 1: "common", 2: "rare", 3: "epic", 4: "poor", 5: "rare", 6: "uncommon" };
// 7 has no icon entry at all.

const ITEMS: AuctionPrice[] = [
  price(1, "Linen Cloth", 100, 5000, 400),
  price(2, "Rare Ring", 5 * G, 3, 2, 3 * G),
  price(3, "Epic Sword", 50 * G, 1, 1, 49 * G),
  price(4, "Junk Dagger", 50, 80, 20),
  price(5, "Rare Plate Helm", 12 * G, 12, 6, 9 * G),
  price(6, "Green Robe", 2 * G, 25, 8, 1 * G),
  price(7, "Mystery Thing", 300, 40, 10),
];

const GEAR = new Map<number, ClientItem>([
  [2, gearItem(2, { slot: "finger", itemType: null, requiredLevel: 30, quality: "rare" })],
  [3, gearItem(3, { slot: "two_hand", itemType: "Sword", requiredLevel: 55, quality: "epic" })],
  [4, gearItem(4, { slot: "one_hand", itemType: "Dagger", requiredLevel: 1, quality: "poor" })],
  [5, gearItem(5, { slot: "head", itemType: "Plate", requiredLevel: 40, quality: "rare" })],
  [6, gearItem(6, { slot: "chest", itemType: "Cloth", requiredLevel: 15, quality: "uncommon" })],
]);

function context(over: Partial<AuctionFilterContext> = {}): AuctionFilterContext {
  return { qualityOf: (id) => QUALITIES[id] ?? null, gear: GEAR, categories: null, bisPicks: null, classId: "mage", ...over };
}

function filters(over: Partial<AuctionFilters>): AuctionFilters {
  return { ...NO_AUCTION_FILTERS, ...over };
}

function ids(over: Partial<AuctionFilters>, ctx = context()): number[] {
  return filterAuctionItems(ITEMS, filters(over), ctx).map((i) => i.itemId);
}

describe("filterAuctionItems", () => {
  it("lets everything through with nothing on", () => {
    expect(ids({})).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("matches a name fragment, ignoring case, or an exact item id", () => {
    expect(ids({ query: "RARE" })).toEqual([2, 5]);
    expect(ids({ query: "3" })).toEqual([3]);
    expect(ids({ query: "  linen  " })).toEqual([1]);
  });

  it("filters by quality, with unknown meaning no icon entry", () => {
    expect(ids({ qualities: ["rare"] })).toEqual([2, 5]);
    expect(ids({ qualities: ["rare", "epic"] })).toEqual([2, 3, 5]);
    expect(ids({ qualities: ["unknown"] })).toEqual([7]);
    expect(ids({ qualities: ["poor", "unknown"] })).toEqual([4, 7]);
  });

  it("filters by market value in gold, both ends included", () => {
    expect(ids({ minGold: 5 })).toEqual([2, 3, 5]);
    expect(ids({ maxGold: 5 })).toEqual([1, 2, 4, 6, 7]);
    expect(ids({ minGold: 2, maxGold: 12 })).toEqual([2, 5, 6]);
    expect(ids({ minGold: 0.01 })).toEqual([1, 2, 3, 5, 6, 7]);
  });

  it("compares gold amounts in whole copper, so 1.1g includes an item at exactly 1g 10s", () => {
    // 1.1 * 10000 is 11000.000000000002 in floating point.
    const items = [price(1, "Exactly 1g 10s", 11_000), price(2, "Just under", 10_999)];
    const match = (over: Partial<AuctionFilters>) => filterAuctionItems(items, filters(over), context()).map((i) => i.itemId);
    expect(match({ minGold: 1.1 })).toEqual([1]);
    expect(match({ maxGold: 1.1 })).toEqual([1, 2]);
  });

  it("filters by units on sale and by listings", () => {
    expect(ids({ minQuantity: 10 })).toEqual([1, 4, 5, 6, 7]);
    expect(ids({ minQuantity: 100 })).toEqual([1]);
    expect(ids({ minListings: 8 })).toEqual([1, 4, 6, 7]);
    expect(ids({ minListings: 50 })).toEqual([1]);
  });

  it("filters gear by slot, type and required level", () => {
    expect(ids({ slot: "head" })).toEqual([5]);
    expect(ids({ itemType: "Sword" })).toEqual([3]);
    expect(ids({ minLevel: 30 })).toEqual([2, 3, 5]);
    expect(ids({ maxLevel: 15 })).toEqual([4, 6]);
    expect(ids({ minLevel: 15, maxLevel: 40 })).toEqual([2, 5, 6]);
  });

  it("leaves items that are not in the gear list out once a gear filter is on, and only then", () => {
    expect(ids({ slot: "chest" })).toEqual([6]);
    expect(ids({ minLevel: 1 })).toEqual([2, 3, 4, 5, 6]);
    expect(ids({ qualities: ["common"] })).toEqual([1]);
  });

  it("does not apply gear filters until the gear list has loaded", () => {
    expect(ids({ slot: "head" }, context({ gear: null }))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps gear the player's class can equip", () => {
    expect(ids({ usable: true }, context({ classId: "mage" }))).toEqual([2, 4, 6]);
    expect(ids({ usable: true }, context({ classId: "warrior" }))).toEqual([2, 3, 4, 5, 6]);
  });


  it("combines every filter: all must hold", () => {
    expect(ids({ qualities: ["rare"], minGold: 10, slot: "head", minLevel: 40, maxLevel: 40, minQuantity: 10, minListings: 5, usable: true }, context({ classId: "paladin" }))).toEqual([5]);
    expect(ids({ qualities: ["rare"], maxGold: 6, query: "ring" })).toEqual([2]);
    expect(ids({ qualities: ["rare"], query: "epic" })).toEqual([]);
    expect(ids({ minGold: 5, minQuantity: 10, qualities: ["rare", "epic"] })).toEqual([5]);
  });

  it("reads a backwards price or level range low to high", () => {
    expect(ids({ minGold: 50, maxGold: 10 })).toEqual(ids({ minGold: 10, maxGold: 50 }));
    expect(ids({ minGold: 50, maxGold: 10 })).toEqual([3, 5]);
    expect(ids({ minLevel: 40, maxLevel: 15 })).toEqual([2, 5, 6]);
  });
});

describe("usableByClass", () => {
  it("honours class-restricted gear, armor type and weapon proficiency", () => {
    expect(usableByClass(gearItem(1, { slot: "head", itemType: "Plate" }), "mage")).toBe(false);
    expect(usableByClass(gearItem(1, { slot: "head", itemType: "Plate" }), "warrior")).toBe(true);
    expect(usableByClass(gearItem(1, { slot: "chest", itemType: "Cloth", classes: ["priest"] }), "mage")).toBe(false);
    expect(usableByClass(gearItem(1, { slot: "two_hand", itemType: "Sword" }), "mage")).toBe(false);
    expect(usableByClass(gearItem(1, { slot: "finger", itemType: null }), "mage")).toBe(true);
  });
});

describe("sortAuctionItems", () => {
  const sorted = (sort: AuctionFilters["sort"]) => sortAuctionItems(ITEMS, sort, context().qualityOf).map((i) => i.itemId);

  it("orders by units on sale, then listings", () => {
    expect(sorted("supply")).toEqual([1, 4, 7, 6, 5, 2, 3]);
    expect(sorted("listings")).toEqual([1, 4, 7, 6, 5, 2, 3]);
  });

  it("orders by price both ways and by name", () => {
    expect(sorted("high")[0]).toBe(3);
    expect(sorted("low")[0]).toBe(4);
    expect(sorted("name")[0]).toBe(3);
  });

  it("orders by the gap between market value and the cheapest listing", () => {
    // gaps: 5 = 3g, 2 = 2g, then 3 and 6 = 1g (by name), the rest 0
    expect(sorted("gap").slice(0, 4)).toEqual([5, 2, 3, 6]);
  });

  it("does not rank an item with no known cheapest auction as the biggest gap", () => {
    const items = [price(1, "Unknown cheapest", 90 * G, 1, 1, 0), price(2, "Small gap", 2 * G, 1, 1, 1 * G)];
    expect(sortAuctionItems(items, "gap", context().qualityOf).map((i) => i.itemId)).toEqual([2, 1]);
  });

  it("orders by quality, rarest first, items without an icon entry last, ties by name", () => {
    expect(sorted("quality")).toEqual([3, 5, 2, 6, 1, 4, 7]);
  });

  it("does not change the list it was given", () => {
    const before = ITEMS.map((i) => i.itemId);
    sorted("high");
    expect(ITEMS.map((i) => i.itemId)).toEqual(before);
  });
});

describe("filtersFromParams / writeFiltersToParams", () => {
  const parse = (qs: string) => filtersFromParams(new URLSearchParams(qs));

  it("reads nothing as no filters", () => {
    expect(parse("")).toEqual(NO_AUCTION_FILTERS);
  });

  it("reads every param", () => {
    expect(parse("q=ring&sort=gap&quality=epic,rare&min=1.5&max=200&qty=10&listings=5&slot=head&type=Plate&lvl=20-40&usable=1")).toEqual({
      query: "ring",
      sort: "gap",
      qualities: ["rare", "epic"],
      minGold: 1.5,
      maxGold: 200,
      minQuantity: 10,
      minListings: 5,
      category: null,
      subcategory: null,
      slot: "head",
      itemType: "Plate",
      minLevel: 20,
      maxLevel: 40,
      usable: true,
      bis: null,
      bisLevel: null,
    });
  });

  it("drops anything that is not an allowed value", () => {
    expect(parse("sort=chaos&quality=mythic,rare,rare&min=-4&max=abc&qty=7&listings=0&slot=hat&type=Cloth;DROP&lvl=x-y&usable=yes")).toEqual({
      ...NO_AUCTION_FILTERS,
      qualities: ["rare"],
    });
    expect(parse("min=999999999").minGold).toBeNull();
    expect(parse("lvl=99-120")).toMatchObject({ minLevel: null, maxLevel: null });
  });

  it("reads one end of a level range", () => {
    expect(parse("lvl=30-")).toMatchObject({ minLevel: 30, maxLevel: null });
    expect(parse("lvl=-40")).toMatchObject({ minLevel: null, maxLevel: 40 });
    expect(parse("lvl=-")).toMatchObject({ minLevel: null, maxLevel: null });
  });

  it("reads level 0 as not set (the lowest level is 1)", () => {
    expect(parse("lvl=0-5")).toMatchObject({ minLevel: null, maxLevel: 5 });
    expect(parse("lvl=00-")).toMatchObject({ minLevel: null, maxLevel: null });
  });

  it("keeps a backwards range as written, so the boxes show what was typed", () => {
    expect(parse("min=50&max=10&lvl=40-15")).toMatchObject({ minGold: 50, maxGold: 10, minLevel: 40, maxLevel: 15 });
  });

  it("round-trips, leaving defaults out and other params alone", () => {
    const full = parse("q=ring&sort=quality&quality=rare,epic&min=2&max=9&qty=100&listings=20&slot=finger&type=Mail&lvl=-30&usable=1");
    const params = writeFiltersToParams(new URLSearchParams("house=neutral&prof=enchanting&recipe=7"), full);
    expect(params.get("house")).toBe("neutral");
    expect(params.get("prof")).toBe("enchanting");
    expect(params.get("recipe")).toBe("7");
    expect(filtersFromParams(params)).toEqual(full);

    const cleared = writeFiltersToParams(params, NO_AUCTION_FILTERS);
    expect(cleared.toString()).toBe("house=neutral&prof=enchanting&recipe=7");
  });
});

describe("describeActiveFilters", () => {
  it("names each filter that is on, in panel order", () => {
    const active = describeActiveFilters(
      filters({ qualities: ["rare", "epic"], minGold: 10, maxGold: 50, minQuantity: 10, minListings: 5, slot: "head", itemType: "Plate", minLevel: 20, usable: true }),
      "Warrior",
      null,
      60,
    );
    expect(active.map((f) => f.label)).toEqual([
      "Quality: Rare, Epic",
      "Price: 10g to 50g",
      "On sale: 10+ units",
      "Listings: 5+",
      "Slot: Head",
      "Type: Plate",
      "Level: at least 20",
      "Usable by Warrior",
    ]);
  });

  it("names a backwards range low to high", () => {
    const active = describeActiveFilters(filters({ minGold: 50, maxGold: 10, minLevel: 40, maxLevel: 15 }), "Warlock", null, 60);
    expect(active.map((f) => f.label)).toEqual(["Price: 10g to 50g", "Level: 15 to 40"]);
  });


  it("is empty with nothing on, and the search and order are not filters", () => {
    expect(describeActiveFilters(filters({ query: "x", sort: "gap" }), "Warlock", null, 60)).toEqual([]);
  });

  it("knows which filters need the gear list", () => {
    expect(gearFilterActive(filters({ qualities: ["rare"], minGold: 1 }))).toBe(false);
    expect(gearFilterActive(filters({ maxLevel: 20 }))).toBe(true);
    expect(gearFilterActive(filters({ usable: true }))).toBe(true);
  });

  it("removes one filter at a time", () => {
    const on = filters({ minGold: 1, maxGold: 2, minLevel: 3, maxLevel: 4 });
    expect({ ...on, ...removalPatch("price") }).toMatchObject({ minGold: null, maxGold: null, minLevel: 3 });
    expect({ ...on, ...removalPatch("level") }).toMatchObject({ minLevel: null, maxLevel: null, minGold: 1 });
  });
});

describe("auctionEmptyMessage", () => {
  const active = describeActiveFilters(filters({ qualities: ["epic"], minGold: 10 }), "Warlock", null, 60);

  it("names the search, the filters, or both", () => {
    expect(auctionEmptyMessage({ query: "zzz", active: [], professionLabel: null })).toBe('No items match "zzz".');
    expect(auctionEmptyMessage({ query: "", active, professionLabel: null })).toBe("No items match these filters: Quality: Epic; Price: at least 10g.");
    expect(auctionEmptyMessage({ query: "zzz", active, professionLabel: null })).toBe(
      'No items match "zzz" with these filters: Quality: Epic; Price: at least 10g.',
    );
  });

  it("speaks of the profession's materials in a profession view", () => {
    expect(auctionEmptyMessage({ query: "zzz", active: [], professionLabel: "Enchanting" })).toBe('No Enchanting materials on sale match "zzz".');
    expect(auctionEmptyMessage({ query: "", active: [], professionLabel: "Enchanting" })).toBe(
      "None of the Enchanting materials are on sale on this auction house right now.",
    );
  });
});

describe("auction filter helpers", () => {
  it("toggleQuality switches one quality and keeps chip order", () => {
    expect(toggleQuality([], "epic")).toEqual(["epic"]);
    expect(toggleQuality(["epic"], "rare")).toEqual(["rare", "epic"]);
    expect(toggleQuality(["rare", "epic"], "rare")).toEqual(["epic"]);
  });

  it("clampToRange pulls a typed number into the allowed range and keeps empty empty", () => {
    expect(clampToRange(-4, 0, 100, 4)).toBe(0);
    expect(clampToRange(250, 1, 60, 0)).toBe(60);
    expect(clampToRange(0, 1, 60, 0)).toBe(1);
    expect(clampToRange(12.5, 0, 100, 4)).toBe(12.5);
    expect(clampToRange(null, 0, 100, 4)).toBeNull();
  });

  it("clampToRange rounds to what a link can hold: whole levels, whole copper", () => {
    expect(clampToRange(5.5, 1, 60, 0)).toBe(6);
    expect(clampToRange(1.23456, 0, 100, 4)).toBe(1.2346);
    expect(clampToRange(0.0000001, 0, 100, 4)).toBe(0);
  });

  it("normalizeRange swaps only a fully backwards pair", () => {
    expect(normalizeRange(50, 10)).toEqual([10, 50]);
    expect(normalizeRange(10, 50)).toEqual([10, 50]);
    expect(normalizeRange(50, null)).toEqual([50, null]);
    expect(normalizeRange(null, 10)).toEqual([null, 10]);
  });

  it("auctionResultsKey changes with the house, profession or filters, not otherwise", () => {
    const base = auctionResultsKey("alliance", null, NO_AUCTION_FILTERS);
    expect(auctionResultsKey("alliance", null, { ...NO_AUCTION_FILTERS })).toBe(base);
    expect(auctionResultsKey("horde", null, NO_AUCTION_FILTERS)).not.toBe(base);
    expect(auctionResultsKey("alliance", "Enchanting", NO_AUCTION_FILTERS)).not.toBe(base);
    expect(auctionResultsKey("alliance", null, filters({ minGold: 1 }))).not.toBe(base);
  });
});
