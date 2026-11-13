import { afterEach, describe, expect, it } from "vitest";
import { NO_AUCTION_FILTERS } from "@/games/wow-forever/data/auctionHouse/noAuctionFilters";
import { decodeGearData } from "@/games/wow-forever/gear/decodeGearData";
import { DEFAULT_GEAR_SETTINGS } from "@/games/wow-forever/hooks/useGearSettings";
import { bisActiveLabel, bisBadgeText, bisLegend } from "@/games/wow-forever/data/auctionHouse/auctionBisCopy";
import { describeActiveFilters, removalPatch } from "@/games/wow-forever/lib/auctionHouse/auctionActiveFilters";
import { filtersFromParams, writeFiltersToParams } from "@/games/wow-forever/lib/auctionHouse/auctionFilterParams";
import { bisLevelFor } from "@/games/wow-forever/lib/auctionHouse/bisLevel";
import { bisPatch } from "@/games/wow-forever/lib/auctionHouse/bisPatch";
import { bisTarget } from "@/games/wow-forever/lib/auctionHouse/bisTarget";
import { savedGearSpec } from "@/games/wow-forever/lib/auctionHouse/savedGearSpec";
import { GEAR_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/useGearSettings";
import { computeBisPicks } from "@/games/wow-forever/lib/auctionHouse/bisPicks";
import { filterAuctionItems } from "@/games/wow-forever/prices/auctionSearch";
import type { AuctionFilterContext } from "@/games/wow-forever/types/auctionHouse/auctionFilterContext";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";
import type { BisPick } from "@/games/wow-forever/types/auctionHouse/bisPick";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { GearFactsFile } from "@/games/wow-forever/types/gearFactsFile";
import type { GearSettings } from "@/games/wow-forever/types/gearSettings";
import type { GearSourcesFile } from "@/games/wow-forever/types/gearSourcesFile";

function item(id: number, patch: Partial<ClientItem>): ClientItem {
  return {
    id,
    name: `Item ${id}`,
    quality: "rare",
    slot: "neck",
    itemType: null,
    itemLevel: 60,
    requiredLevel: 0,
    armor: null,
    weapon: null,
    stats: { spell_damage: id },
    classes: null,
    damageUnknown: false,
    otherEffects: 0,
    randomSuffix: false,
    ...patch,
  };
}

const FACTS: GearFactsFile = {
  clientBuild: "1.60.1.70790",
  eraLeftovers: [],
  deprecated: [],
  crafted: {},
  requires: {},
  reputation: {},
  pvp: {},
  bindOnPickup: {},
};
const SOURCES: GearSourcesFile = { dungeons: {}, raidOnly: [], pvp: [], quests: {}, drops: {} };

function gearData(facts: Partial<GearFactsFile> = {}) {
  return decodeGearData({ ...FACTS, ...facts }, SOURCES);
}

const WARLOCK: GearSettings = { ...DEFAULT_GEAR_SETTINGS, classId: "warlock", specId: "affliction" };
const picksAt = (items: ClientItem[], level: number, facts: Partial<GearFactsFile> = {}) =>
  computeBisPicks(items, gearData(facts), WARLOCK, level);
const rankOf = (picks: ReadonlyMap<number, BisPick>, id: number) => picks.get(id)?.rank ?? null;

describe("computeBisPicks", () => {
  it("ranks the three best items of a slot 1, 2, 3 by score and leaves the rest out", () => {
    const picks = picksAt([item(10, {}), item(40, {}), item(30, {}), item(20, {})], 60);
    expect(rankOf(picks, 40)).toBe(1);
    expect(rankOf(picks, 30)).toBe(2);
    expect(rankOf(picks, 20)).toBe(3);
    expect(picks.has(10)).toBe(false);
    expect(picks.get(40)?.slot).toBe("Neck");
  });

  it("compares by score alone, so an item with no known source is not marked down", () => {
    const picks = picksAt([item(100, {}), item(102, {})], 60);
    expect(rankOf(picks, 102)).toBe(1);
    expect(rankOf(picks, 100)).toBe(2);
  });

  it("ranks rings as one pool of three, not per finger", () => {
    const rings = [1, 2, 3, 4].map((n) => item(n * 10, { slot: "finger" }));
    const picks = picksAt(rings, 60);
    expect([40, 30, 20].map((id) => rankOf(picks, id))).toEqual([1, 2, 3]);
    expect(picks.has(10)).toBe(false);
    expect(picks.get(40)?.slot).toBe("Rings");
  });

  it("ranks trinkets as one pool of three", () => {
    const picks = picksAt([5, 6, 7, 8].map((n) => item(n, { slot: "trinket" })), 60);
    expect([8, 7, 6].map((id) => rankOf(picks, id))).toEqual([1, 2, 3]);
    expect(picks.has(5)).toBe(false);
  });

  it("skips bind-on-pickup items, so the next best moves up", () => {
    const picks = picksAt([item(40, {}), item(30, {}), item(20, {}), item(10, {})], 60, { bindOnPickup: { "40": 1 } });
    expect(picks.has(40)).toBe(false);
    expect([30, 20, 10].map((id) => rankOf(picks, id))).toEqual([1, 2, 3]);
  });

  it("skips random-suffix items", () => {
    const picks = picksAt([item(40, { randomSuffix: true }), item(30, {})], 60);
    expect(picks.has(40)).toBe(false);
    expect(rankOf(picks, 30)).toBe(1);
  });

  it("uses the level: an item you can't wear yet is not a pick, and the best one you can is", () => {
    const items = [item(15, { requiredLevel: 15 }), item(50, { requiredLevel: 40 })];
    expect([...picksAt(items, 20).keys()]).toEqual([15]);
    const at45 = picksAt(items, 45);
    expect(rankOf(at45, 50)).toBe(1);
    expect(rankOf(at45, 15)).toBe(2);
  });

  it("estimates the level of an item that doesn't say it, so it is not a low-level pick", () => {
    const late = item(70, { requiredLevel: 1, itemLevel: 60 });
    expect(picksAt([late], 20).size).toBe(0);
    expect(picksAt([late], 60).size).toBe(1);
  });

  it("keeps two-hand weapons and main hand weapons as separate cards", () => {
    const staff = item(90, { slot: "two_hand", itemType: "Staff" });
    const dagger = item(80, { slot: "one_hand", itemType: "Dagger" });
    const picks = picksAt([staff, dagger], 60);
    expect(picks.get(90)).toEqual({ rank: 1, slot: "Two-hand weapon" });
    expect(picks.get(80)).toEqual({ rank: 1, slot: "Main hand" });
  });

  it("leaves out gear the class can't wear", () => {
    const plate = item(60, { slot: "head", itemType: "Plate", armor: 400 });
    expect(picksAt([plate], 60).size).toBe(0);
  });
});

describe("top picks filter", () => {
  const PICKS = new Map<number, BisPick>([
    [1, { rank: 1, slot: "Head" }],
    [2, { rank: 2, slot: "Head" }],
    [3, { rank: 3, slot: "Neck" }],
  ]);
  const price = (itemId: number): AuctionPrice => ({ itemId, name: `Item ${itemId}`, marketValue: 100, minBuyout: 90, quantity: 1, listings: 1 });
  const rows = [1, 2, 3, 4].map(price);
  const context = (bisPicks: AuctionFilterContext["bisPicks"]): AuctionFilterContext => ({
    qualityOf: () => null,
    gear: null,
    categories: null,
    bisPicks,
    classId: "warlock",
  });
  const ids = (over: Partial<AuctionFilters>, bisPicks: AuctionFilterContext["bisPicks"] = PICKS) =>
    filterAuctionItems(rows, { ...NO_AUCTION_FILTERS, ...over }, context(bisPicks)).map((r) => r.itemId);

  it("keeps only the picks for any top 3", () => {
    expect(ids({ bis: "any" })).toEqual([1, 2, 3]);
  });

  it("keeps only the asked rank", () => {
    expect(ids({ bis: 1 })).toEqual([1]);
    expect(ids({ bis: 2 })).toEqual([2]);
    expect(ids({ bis: 3 })).toEqual([3]);
  });

  it("doesn't apply until the picks are known, and does nothing when off", () => {
    expect(ids({ bis: "any" }, null)).toEqual([1, 2, 3, 4]);
    expect(ids({})).toEqual([1, 2, 3, 4]);
  });
});

describe("top picks in the link and the chips", () => {
  const parse = (qs: string) => filtersFromParams(new URLSearchParams(qs));

  it("reads bis and bisLvl, ignoring anything else", () => {
    expect(parse("bis=any&bisLvl=24")).toMatchObject({ bis: "any", bisLevel: 24 });
    expect(parse("bis=2")).toMatchObject({ bis: 2, bisLevel: null });
    expect(parse("bis=4")).toMatchObject({ bis: null });
    expect(parse("bis=best")).toMatchObject({ bis: null });
    expect(parse("bis=1&bisLvl=61")).toMatchObject({ bis: 1, bisLevel: null });
    expect(parse("bis=1&bisLvl=0")).toMatchObject({ bis: 1, bisLevel: null });
    expect(parse("bis=1&bisLvl=1e1")).toMatchObject({ bis: 1, bisLevel: null });
    expect(parse("bisLvl=24")).toMatchObject({ bis: null, bisLevel: null });
  });

  it("round-trips and leaves the params out when off", () => {
    const filters = parse("bis=3&bisLvl=24");
    const params = writeFiltersToParams(new URLSearchParams("house=horde"), filters);
    expect(params.toString()).toBe("house=horde&bis=3&bisLvl=24");
    expect(writeFiltersToParams(params, NO_AUCTION_FILTERS).toString()).toBe("house=horde");
  });

  it("uses the link's level, else the player's, else 60", () => {
    expect(bisLevelFor({ bisLevel: 24 }, 40)).toBe(24);
    expect(bisLevelFor({ bisLevel: null }, 40)).toBe(40);
    expect(bisLevelFor({ bisLevel: null }, null)).toBe(60);
  });

  it("says BiS only at level 60", () => {
    expect(bisActiveLabel("any", { level: 24, label: "Warlock" })).toBe("Top 3 for level 24 Warlock");
    expect(bisActiveLabel(2, { level: 24, label: "Warlock" })).toBe("#2 pick for level 24 Warlock");
    expect(bisActiveLabel("any", { level: 60, label: "Warlock" })).toBe("Top 3 BiS for level 60 Warlock");
    expect(bisActiveLabel(1, { level: 60, label: "Warlock" })).toBe("#1 BiS for level 60 Warlock");
    expect(bisLegend(24)).toBe("Top picks for my level");
    expect(bisLegend(60)).toContain("BiS");
    expect(bisBadgeText({ rank: 1, slot: "Head" })).toBe("#1 Head");
  });

  it("names the spec only at level 60, where its weights are used", () => {
    expect(bisTarget(60, "warlock", "affliction")).toEqual({ level: 60, label: "Affliction Warlock" });
    expect(bisTarget(24, "warlock", "affliction")).toEqual({ level: 24, label: "Warlock" });
    expect(bisTarget(60, "warlock", "not-a-spec")).toEqual({ level: 60, label: "Warlock" });
  });

  it("is an active filter that can be removed", () => {
    const on: AuctionFilters = { ...NO_AUCTION_FILTERS, bis: "any" };
    expect(describeActiveFilters(on, "Warlock", null, { level: 24, label: "Warlock" })).toEqual([{ group: "bis", label: "Top 3 for level 24 Warlock" }]);
    expect(removalPatch("bis")).toEqual({ bis: null, bisLevel: null });
  });

  it("switches chip, and clears on Off or on the chip that is on", () => {
    expect(bisPatch("2", null)).toEqual({ bis: 2 });
    expect(bisPatch("any", 1)).toEqual({ bis: "any" });
    expect(bisPatch("2", 2)).toEqual({ bis: null, bisLevel: null });
    expect(bisPatch("off", "any")).toEqual({ bis: null, bisLevel: null });
  });
});

describe("savedGearSpec", () => {
  afterEach(() => window.localStorage.clear());

  it("uses the Best gear page's spec when it is for the same class", () => {
    window.localStorage.setItem(GEAR_SETTINGS_STORAGE_KEY, JSON.stringify({ ...DEFAULT_GEAR_SETTINGS, classId: "warlock", specId: "destruction" }));
    expect(savedGearSpec("warlock")).toBe("destruction");
  });

  it("falls back to the class's first spec for another class, or nothing saved", () => {
    window.localStorage.setItem(GEAR_SETTINGS_STORAGE_KEY, JSON.stringify({ ...DEFAULT_GEAR_SETTINGS, classId: "mage", specId: "frost" }));
    expect(savedGearSpec("warlock")).toBe("affliction");
    window.localStorage.clear();
    expect(savedGearSpec("warlock")).toBe("affliction");
  });
});
