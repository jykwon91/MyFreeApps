import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enchantingJson from "@/games/wow-forever/data/professions/crafting/enchanting.json";
import trainerSkillsJson from "@/games/wow-forever/data/professions/crafting/classic/trainerSkills.json";
import { cheapestRoute, priceItems, type CraftContext } from "@/games/wow-forever/crafting/cheapestRoute";
import { createPriceBook } from "@/games/wow-forever/crafting/matPrices";
import { CRAFTING_GUIDES } from "@/games/wow-forever/data/professions/crafting/craftingGuide";
import { CRAFTING_ROUTES } from "@/games/wow-forever/data/professions/crafting/craftingRoutes";
import { CRAFTING_RANKS } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import { cheaperWay, cookCost } from "@/games/wow-forever/food/foodPrices";
import { clothAuctionPerHour, skinAuctionPerHour } from "@/games/wow-forever/gold/farmAuctionValue";
import { clothPerHour } from "@/games/wow-forever/gold/goldFarms";
import { goldFarms } from "@/games/wow-forever/gold/goldFarmsData";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";
import {
  auctionCopper,
  auctionCopperByName,
  effectivePrices,
  mapPriceList,
} from "@/games/wow-forever/prices/auctionPrices";
import type { CraftingFile, CraftingProfession, TrainerSkills } from "@/games/wow-forever/types/crafting";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";
import { PRICE_COLUMNS, priceList } from "@/test/auctionPricesStub";

const SILVER = 100;

describe("mapPriceList", () => {
  it("reads rows by column name, in copper", () => {
    const response: PriceListResponse = {
      region: "us",
      faction: "horde",
      source_updated_at: "2026-11-05T14:49:31Z",
      fetched_at: "2026-11-06T09:00:00Z",
      // A column order the server could switch to: the mapper must not care.
      columns: ["name", "listings", "item_id", "quantity", "min_buyout", "market_value"],
      items: [["Linen Cloth", 910, 2589, 23980, 22, 27]],
    };
    const prices = mapPriceList(response);
    expect(prices.faction).toBe("horde");
    expect(prices.sourceUpdatedAt).toBe("2026-11-05T14:49:31Z");
    expect(prices.byId.get(2589)).toEqual({
      itemId: 2589,
      name: "Linen Cloth",
      marketValue: 27,
      minBuyout: 22,
      quantity: 23980,
      listings: 910,
    });
  });

  it("skips rows without an id or a market value; a missing figure falls back, never to a made-up price", () => {
    const prices = mapPriceList({
      ...priceList([]),
      columns: PRICE_COLUMNS,
      items: [
        [0, 10, 10, 1, 1, "Zero Id"],
        [100, null, 5, 1, 1, "No Value"],
        [101, -5, 5, 1, 1, "Negative"],
        [102, 350, null, null, null, "Gloves"],
      ],
    });
    expect([...prices.byId.keys()]).toEqual([102]);
    expect(prices.byId.get(102)).toMatchObject({ marketValue: 350, minBuyout: 350, quantity: 0, listings: 0 });
  });

  it("finds items by id and by name, and gives undefined (never 0) for one it lacks", () => {
    const prices = mapPriceList(priceList([[2589, 28, "Linen Cloth"]]));
    expect(auctionCopper(prices, 2589)).toBe(28);
    expect(auctionCopper(prices, 2592)).toBeUndefined();
    expect(auctionCopper(null, 2589)).toBeUndefined();
    expect(auctionCopperByName(prices, " linen cloth ")).toBe(28);
    expect(auctionCopperByName(prices, "Wool Cloth")).toBeUndefined();
  });

  it("an auction house with nothing listed has no prices", () => {
    const prices = mapPriceList(priceList([]));
    expect(prices.byId.size).toBe(0);
    expect(prices.sourceUpdatedAt).toBeNull();
  });
});

describe("effectivePrices", () => {
  it("is every auction price, with your own price winning", () => {
    const prices = mapPriceList(priceList([[2589, 28, "Linen Cloth"], [2592, 868, "Wool Cloth"]]));
    expect(effectivePrices(prices, { "2592": 0 })).toEqual({ "2589": 28, "2592": 0 });
    expect(effectivePrices(null, { "2592": 5 })).toEqual({ "2592": 5 });
  });
});

describe("the cheapest route from fetched prices", () => {
  const file = enchantingJson as unknown as CraftingFile;
  const profession: CraftingProfession = "enchanting";
  const strangeDust = 10940;
  const ctx: CraftContext = {
    file,
    recipes: new Map(file.recipes.map((r) => [r.spell, r])),
    trainerSkills: (trainerSkillsJson as unknown as Record<CraftingProfession, TrainerSkills>)[profession],
    route: CRAFTING_ROUTES[profession],
    ranks: CRAFTING_RANKS[profession],
    professionLabel: CRAFTING_GUIDES[profession].label,
  };
  const choices = { knownFormulas: new Set<number>(), excludedSlots: new Set<never>() };
  const items = priceItems(ctx, 1, choices);
  // The prices API's answer: every material the route could use, at 1s each.
  const fetched = mapPriceList(priceList([...items.main, ...items.more].map((i) => [i.id, SILVER, i.name] as [number, number, string])));

  it("prices the whole route to 300 with nothing typed", () => {
    const book = createPriceBook(effectivePrices(fetched, {}), ctx.file, ctx.professionLabel);
    const route = cheapestRoute(ctx, 1, book, choices);
    expect(route.priced).toBe(true);
    expect(route.unknown).toBe(false);
    expect(route.reach).toBe(300);
    expect(route.total).toBeGreaterThan(0);
  });

  it("a price you type over the auction price changes the total", () => {
    const atAuction = cheapestRoute(ctx, 1, createPriceBook(effectivePrices(fetched, {}), ctx.file, ctx.professionLabel), choices);
    const farmed = cheapestRoute(ctx, 1, createPriceBook(effectivePrices(fetched, { [strangeDust]: 0 }), ctx.file, ctx.professionLabel), choices);
    expect(farmed.total).toBeLessThan(atAuction.total);
  });

  it("an item missing from the prices leaves its rows without a cost, not free", () => {
    const rows = [...items.main, ...items.more].filter((i) => i.id !== strangeDust).map((i) => [i.id, SILVER, i.name] as [number, number, string]);
    const route = cheapestRoute(ctx, 1, createPriceBook(effectivePrices(mapPriceList(priceList(rows)), {}), ctx.file, ctx.professionLabel), choices);
    expect(route.unknown).toBe(true);
    expect(route.reach).toBeLessThan(300);
  });
});

describe("cookCost", () => {
  const food = { reagents: [{ id: 2672, name: "Stringy Wolf Meat", count: 1 }, { id: 2678, name: "Mild Spices", count: 2 }] };

  it("adds up the ingredients and lists the ones with no auction price", () => {
    const prices = mapPriceList(priceList([[2672, 15, "Stringy Wolf Meat"]]));
    const cook = cookCost(food, prices);
    expect(cook.total).toBe(15);
    expect(cook.missing.map((r) => r.name)).toEqual(["Mild Spices"]);
    // Not every ingredient is priced, so there's no honest buy-or-cook answer.
    expect(cheaperWay(cook, 100)).toBeNull();
  });

  it("says which is cheaper only when everything is priced", () => {
    const prices = mapPriceList(priceList([[2672, 15, "Stringy Wolf Meat"], [2678, 5, "Mild Spices"]]));
    const cook = cookCost(food, prices);
    expect(cook.total).toBe(25);
    expect(cheaperWay(cook, 100)).toBe("cook");
    expect(cheaperWay(cook, 20)).toBe("buy");
    expect(cheaperWay(cook, undefined)).toBeNull();
  });
});

describe("gold farm auction values", () => {
  const farm = goldFarms().find((f) => f.cloth === "Linen Cloth" && clothPerHour(f) > 0);

  it("prices an hour of cloth by name, and nothing for cloth with no price", () => {
    if (!farm) throw new Error("no linen farm");
    expect(clothAuctionPerHour(farm, mapPriceList(priceList([[2589, 28, "Linen Cloth"]])))).toBeCloseTo(28 * clothPerHour(farm));
    expect(clothAuctionPerHour(farm, mapPriceList(priceList([])))).toBeUndefined();
  });

  it("prices a skin per kill", () => {
    const beast = goldFarms().find((f) => f.skin === "Light Leather");
    if (!beast) throw new Error("no light leather farm");
    expect(skinAuctionPerHour(beast, mapPriceList(priceList([[2318, 90, "Light Leather"]])))).toBe(90 * beast.killsPerHour);
  });
});

describe("relativeTime past an hour", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("counts hours, then days", () => {
    vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
    expect(relativeTime("2026-11-06T11:00:00Z")).toBe("1 hour ago");
    expect(relativeTime("2026-11-06T09:00:00Z")).toBe("3 hours ago");
    expect(relativeTime("2026-11-05T11:00:00Z")).toBe("1 day ago");
    expect(relativeTime("2026-11-03T12:00:00Z")).toBe("3 days ago");
  });
});
