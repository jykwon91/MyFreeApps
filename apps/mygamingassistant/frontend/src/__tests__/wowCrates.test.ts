import { describe, expect, it } from "vitest";
import { buildCrateRows } from "@/games/wow-forever/lib/crates/buildCrateRows";
import { cheapestBundleIndex } from "@/games/wow-forever/lib/crates/cheapestBundleIndex";
import { crateDisplayName } from "@/games/wow-forever/lib/crates/crateDisplayName";
import { crateTierCounts } from "@/games/wow-forever/lib/crates/crateFacets";
import { costPerReward, crateReward } from "@/games/wow-forever/lib/crates/crateReward";
import { crateViewFromParams, crateViewToParams } from "@/games/wow-forever/lib/crates/crateViewParams";
import { filterCrateRows } from "@/games/wow-forever/lib/crates/filterCrateRows";
import { sortCrateRows } from "@/games/wow-forever/lib/crates/sortCrateRows";
import { CRATES_FILE } from "@/games/wow-forever/data/professions/crates/cratesData";
import { CRATE_REWARDS } from "@/games/wow-forever/data/professions/crates/crateRewards";
import type { CrateFilters } from "@/games/wow-forever/types/crates/crateFilters";
import type { CrateRecord } from "@/games/wow-forever/types/crates/crateRecord";
import type { CrateQuality } from "@/games/wow-forever/types/crates/crateQuality";
import type { CrateTier } from "@/games/wow-forever/types/crates/crateTier";
import type { CratesFile } from "@/games/wow-forever/types/crates/cratesFile";

function crate(id: number, name: string, tier: CrateTier, bundles: [number, number][], quality: CrateQuality = "common"): CrateRecord {
  return {
    id,
    name: `Waylaid Crate: ${name}`,
    tier,
    quality,
    bundles: bundles.map(([count, itemId]) => ({ count, item: { id: itemId, name: `Item ${itemId}` } })),
  };
}

const FILE: CratesFile = {
  build: "1",
  attribution: "",
  crates: [
    crate(1, "Alpha", "apprentice", [[10, 101], [5, 102]]), // 10x5=50, 5x20=100 -> 101 wins; crate 30 -> 80
    crate(2, "Bravo", "journeyman", [[10, 103], [10, 104], [2, 105]]), // 103 unpriced; 104=100; 105=60 -> 105 wins; crate 20 -> 80
    crate(3, "Charlie", "expert", [[4, 106], [4, 107]], "uncommon"), // tie 40 / 40 -> first (106); crate 10 -> 50
    crate(4, "Delta", "expert", [[1, 108], [1, 109]]), // nothing priced -> no total
    crate(5, "Echo", "artisan", [[1, 110]]), // crate unpriced -> no total, bundle priced
    crate(6, "Foxtrot", "artisan", [[1, 111]]), // 500; crate 5 -> 505
  ],
};

const PRICES = new Map<number, number>([
  [1, 30],
  [101, 5],
  [102, 20],
  [2, 20],
  [104, 10],
  [105, 30],
  [3, 10],
  [106, 10],
  [107, 10],
  [4, 99],
  [110, 7],
  [6, 5],
  [111, 500],
]);

const rows = buildCrateRows(FILE, (id) => PRICES.get(id));
const byName = (name: string) => rows.find((r) => r.crate.name.endsWith(name));
const names = (list: typeof rows) => list.map((r) => crateDisplayName(r.crate.name));
const NONE: CrateFilters = { tier: null, query: "" };

describe("cheapestBundleIndex", () => {
  it("picks the lowest known cost and skips unknown ones", () => {
    expect(cheapestBundleIndex([100, null, 60])).toBe(2);
  });

  it("is -1 when nothing is known", () => {
    expect(cheapestBundleIndex([null, null])).toBe(-1);
    expect(cheapestBundleIndex([])).toBe(-1);
  });

  it("keeps the first of a tie", () => {
    expect(cheapestBundleIndex([40, 40])).toBe(0);
  });

  it("does not treat a zero cost as unknown", () => {
    expect(cheapestBundleIndex([null, 0, 5])).toBe(1);
  });
});

describe("buildCrateRows", () => {
  it("costs a bundle as count x the material's price and marks the cheapest", () => {
    const alpha = byName("Alpha");
    expect(alpha?.bundles.map((b) => b.cost)).toEqual([50, 100]);
    expect(alpha?.bundles.map((b) => b.cheapest)).toEqual([true, false]);
    expect(alpha?.cheapest?.bundle.item.id).toBe(101);
    expect(alpha?.bundleCost).toBe(50);
    expect(alpha?.total).toBe(80);
  });

  it("skips bundles whose material has no price", () => {
    const bravo = byName("Bravo");
    expect(bravo?.bundles[0].cost).toBeNull();
    expect(bravo?.bundles[0].unitPrice).toBeNull();
    expect(bravo?.cheapest?.bundle.item.id).toBe(105);
    expect(bravo?.total).toBe(80);
  });

  it("takes the first bundle in game order on a tie", () => {
    const charlie = byName("Charlie");
    expect(charlie?.cheapest?.bundle.item.id).toBe(106);
    expect(charlie?.bundles.filter((b) => b.cheapest)).toHaveLength(1);
    expect(charlie?.total).toBe(50);
  });

  it("has no cheapest bundle and no total when no bundle is priced, even with a crate price", () => {
    const delta = byName("Delta");
    expect(delta?.cratePrice).toBe(99);
    expect(delta?.cheapest).toBeNull();
    expect(delta?.bundleCost).toBeNull();
    expect(delta?.total).toBeNull();
    expect(delta?.bundles.every((b) => !b.cheapest)).toBe(true);
  });

  it("has no total when the crate itself is unpriced, never a partial sum", () => {
    const echo = byName("Echo");
    expect(echo?.bundleCost).toBe(7);
    expect(echo?.cratePrice).toBeNull();
    expect(echo?.total).toBeNull();
  });

  it("has no total for any row when no prices are known", () => {
    expect(buildCrateRows(FILE, () => undefined).every((r) => r.total === null && r.cheapest === null)).toBe(true);
  });

  it("builds a row for every crate in the real data, each with at least one bundle", () => {
    const real = buildCrateRows(CRATES_FILE, () => 1);
    expect(real).toHaveLength(CRATES_FILE.crates.length);
    expect(real.every((r) => r.bundles.length > 0 && r.total !== null)).toBe(true);
  });
});

describe("crateDisplayName", () => {
  it("drops the Waylaid Crate prefix and leaves other names alone", () => {
    expect(crateDisplayName("Waylaid Crate: Journeyman Herbs")).toBe("Journeyman Herbs");
    expect(crateDisplayName("Something else")).toBe("Something else");
  });
});

describe("crate rewards", () => {
  const COMBOS: [CrateTier, CrateQuality, number][] = [
    ["apprentice", "common", 5],
    ["apprentice", "uncommon", 10],
    ["journeyman", "common", 10],
    ["journeyman", "uncommon", 20],
    ["expert", "common", 15],
    ["expert", "uncommon", 30],
    ["artisan", "common", 20],
    ["artisan", "uncommon", 40],
  ];

  it.each(COMBOS)("%s %s crate pays %i rewards", (tier, quality, expected) => {
    expect(crateReward({ tier, quality })).toBe(expected);
    expect(CRATE_REWARDS[tier][quality]).toBe(expected);
  });

  it("divides the total by the rewards and rounds to the nearest copper", () => {
    expect(costPerReward(100, 5)).toBe(20);
    expect(costPerReward(80, 5)).toBe(16);
    expect(costPerReward(50, 30)).toBe(2);
    expect(costPerReward(505, 20)).toBe(25);
    expect(costPerReward(0, 10)).toBe(0);
  });

  it("is unknown when the total is unknown", () => {
    expect(costPerReward(null, 10)).toBeNull();
  });

  it("puts reward and cost per reward on every row, null when there is no total", () => {
    expect(rows.map((r) => [crateDisplayName(r.crate.name), r.reward, r.costPerReward])).toEqual([
      ["Alpha", 5, 16],
      ["Bravo", 10, 8],
      ["Charlie", 30, 2],
      ["Delta", 15, null],
      ["Echo", 20, null],
      ["Foxtrot", 20, 25],
    ]);
  });

  it("gives every crate in the real data a quality and a reward", () => {
    for (const record of CRATES_FILE.crates) {
      expect(["common", "uncommon"], record.name).toContain(record.quality);
      expect(crateReward(record), record.name).toBeGreaterThan(0);
    }
  });
});

describe("sortCrateRows", () => {
  it("orders by cost per reward ascending with unknowns last, ties and unknowns by name", () => {
    expect(names(sortCrateRows(rows, { key: "perReward", direction: "asc" }))).toEqual([
      "Charlie",
      "Bravo",
      "Alpha",
      "Foxtrot",
      "Delta",
      "Echo",
    ]);
    expect(names(sortCrateRows(rows, { key: "perReward", direction: "desc" }))).toEqual([
      "Foxtrot",
      "Alpha",
      "Bravo",
      "Charlie",
      "Delta",
      "Echo",
    ]);
  });

  it("orders by the reward count", () => {
    expect(names(sortCrateRows(rows, { key: "reward", direction: "asc" }))).toEqual(["Alpha", "Bravo", "Delta", "Echo", "Foxtrot", "Charlie"]);
  });

  it("orders by total ascending with unknown totals last", () => {
    expect(names(sortCrateRows(rows, { key: "total", direction: "asc" }))).toEqual([
      "Charlie",
      "Alpha",
      "Bravo",
      "Foxtrot",
      "Delta",
      "Echo",
    ]);
  });

  it("keeps unknown totals last when descending", () => {
    expect(names(sortCrateRows(rows, { key: "total", direction: "desc" }))).toEqual([
      "Foxtrot",
      "Alpha",
      "Bravo",
      "Charlie",
      "Delta",
      "Echo",
    ]);
  });

  it("orders by tier apprentice < journeyman < expert < artisan, then by name", () => {
    expect(names(sortCrateRows(rows, { key: "tier", direction: "asc" }))).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"]);
    expect(names(sortCrateRows(rows, { key: "tier", direction: "desc" }))[0]).toBe("Echo");
  });

  it("orders by name and by the price columns, unknowns last either way", () => {
    expect(names(sortCrateRows(rows, { key: "name", direction: "desc" }))[0]).toBe("Foxtrot");
    expect(names(sortCrateRows(rows, { key: "cratePrice", direction: "asc" })).slice(-1)[0]).toBe("Echo");
    expect(names(sortCrateRows(rows, { key: "cratePrice", direction: "desc" })).slice(-1)[0]).toBe("Echo");
    expect(names(sortCrateRows(rows, { key: "bundleCost", direction: "asc" })).slice(-1)[0]).toBe("Delta");
    expect(names(sortCrateRows(rows, { key: "bundleCost", direction: "desc" })).slice(-1)[0]).toBe("Delta");
    expect(names(sortCrateRows(rows, { key: "bundleCost", direction: "desc" }))[0]).toBe("Foxtrot");
  });

  it("does not change the input", () => {
    const before = names(rows);
    sortCrateRows(rows, { key: "total", direction: "desc" });
    expect(names(rows)).toEqual(before);
  });
});

describe("filterCrateRows and tier counts", () => {
  it("filters by tier", () => {
    expect(names(filterCrateRows(rows, { ...NONE, tier: "expert" }))).toEqual(["Charlie", "Delta"]);
    expect(names(filterCrateRows(rows, NONE))).toHaveLength(6);
  });

  it("counts every tier, ignoring the tier filter itself", () => {
    const expected = { all: 6, apprentice: 1, journeyman: 1, expert: 2, artisan: 2 };
    expect(crateTierCounts(rows, NONE)).toEqual(expected);
    expect(crateTierCounts(rows, { ...NONE, tier: "artisan" })).toEqual(expected);
  });

  it("counts the real data's tiers", () => {
    const real = buildCrateRows(CRATES_FILE, () => undefined);
    const counts = crateTierCounts(real, NONE);
    expect(counts.all).toBe(CRATES_FILE.crates.length);
    expect(counts.apprentice + counts.journeyman + counts.expert + counts.artisan).toBe(counts.all);
  });
});

describe("crate search", () => {
  const search = (query: string, extra: Partial<CrateFilters> = {}) => names(filterCrateRows(rows, { ...NONE, ...extra, query }));

  it("finds a crate by its name, in any case", () => {
    expect(search("bravo")).toEqual(["Bravo"]);
    expect(search("  WAYLAID crate: echo ")).toEqual(["Echo"]);
    expect(search("zzz")).toEqual([]);
  });

  it("finds a crate by any of its bundles' materials, every word required", () => {
    expect(search("item 108")).toEqual(["Delta"]);
    expect(search("item 107")).toEqual(["Charlie"]);
    expect(search("item 1")).toHaveLength(6);
    expect(search("item 108 delta")).toEqual(["Delta"]);
    expect(search("item 108 charlie")).toEqual([]);
  });

  it("combines with the tier filter and the counts reflect it", () => {
    expect(search("item 10", { tier: "expert" })).toEqual(["Charlie", "Delta"]);
    expect(search("item 110", { tier: "expert" })).toEqual([]);
    expect(crateTierCounts(rows, { ...NONE, query: "item 10" })).toEqual({ all: 5, apprentice: 1, journeyman: 1, expert: 2, artisan: 1 });
    expect(crateTierCounts(rows, { tier: "artisan", query: "item 10" }).all).toBe(5);
  });

  it("round-trips through ?q=", () => {
    expect(crateViewFromParams(new URLSearchParams("q=%20silk%20cloth%20")).filters.query).toBe("silk cloth");
    expect(crateViewFromParams(new URLSearchParams()).filters.query).toBe("");
    const view = crateViewFromParams(new URLSearchParams("q=silk&house=horde"));
    expect(crateViewToParams(new URLSearchParams("house=horde"), view).toString()).toBe("house=horde&q=silk");
    expect(crateViewToParams(new URLSearchParams("q=silk"), { ...view, filters: { ...view.filters, query: "" } }).toString()).toBe("");
  });
});

describe("crateViewFromParams / crateViewToParams", () => {
  it("reads defaults from an empty link", () => {
    expect(crateViewFromParams(new URLSearchParams())).toEqual({ filters: NONE, sort: { key: "perReward", direction: "asc" } });
  });

  it("reads every param", () => {
    expect(crateViewFromParams(new URLSearchParams("tier=apprentice&sort=bundleCost&dir=desc"))).toEqual({
      filters: { tier: "apprentice", query: "" },
      sort: { key: "bundleCost", direction: "desc" },
    });
  });

  it("ignores values that are not allowed", () => {
    expect(crateViewFromParams(new URLSearchParams("tier=legendary&sort=bogus&dir=sideways"))).toEqual({
      filters: NONE,
      sort: { key: "perReward", direction: "asc" },
    });
  });

  it("round-trips the per-reward and rewards keys, and an old ?sort=total link still reads", () => {
    expect(crateViewFromParams(new URLSearchParams("sort=perReward&dir=desc")).sort).toEqual({ key: "perReward", direction: "desc" });
    expect(crateViewFromParams(new URLSearchParams("sort=reward")).sort).toEqual({ key: "reward", direction: "asc" });
    expect(crateViewFromParams(new URLSearchParams("sort=total")).sort).toEqual({ key: "total", direction: "asc" });
    expect(crateViewToParams(new URLSearchParams(), { filters: NONE, sort: { key: "perReward", direction: "asc" } }).toString()).toBe("");
    expect(crateViewToParams(new URLSearchParams(), { filters: NONE, sort: { key: "total", direction: "asc" } }).toString()).toBe("sort=total");
    for (const key of ["perReward", "reward", "total"] as const) {
      const view = { filters: NONE, sort: { key, direction: "desc" as const } };
      expect(crateViewFromParams(crateViewToParams(new URLSearchParams(), view))).toEqual(view);
    }
  });

  it("writes only what differs from the defaults and leaves other params alone", () => {
    const params = crateViewToParams(new URLSearchParams("house=neutral"), {
      filters: { tier: "artisan", query: "" },
      sort: { key: "total", direction: "desc" },
    });
    expect(params.toString()).toBe("house=neutral&tier=artisan&sort=total&dir=desc");
  });

  it("round-trips a view through a link", () => {
    const view = { filters: { tier: "expert" as const, query: "silk cloth" }, sort: { key: "name" as const, direction: "desc" as const } };
    expect(crateViewFromParams(crateViewToParams(new URLSearchParams(), view))).toEqual(view);
  });

  it("removes params when the view goes back to defaults", () => {
    const params = crateViewToParams(new URLSearchParams("tier=expert&sort=tier&dir=desc&house=horde"), {
      filters: NONE,
      sort: { key: "perReward", direction: "asc" },
    });
    expect(params.toString()).toBe("house=horde");
  });
});
