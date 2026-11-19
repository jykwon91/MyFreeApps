import { describe, expect, it } from "vitest";
import { buildWritRows } from "@/games/wow-forever/lib/writs/buildWritRows";
import { filterWritRows } from "@/games/wow-forever/lib/writs/filterWritRows";
import { isWritDeal } from "@/games/wow-forever/lib/writs/isWritDeal";
import { sortWritRows } from "@/games/wow-forever/lib/writs/sortWritRows";
import { knownLocations, locationOptions, tierCounts } from "@/games/wow-forever/lib/writs/writFacets";
import { summarizeTurnIn } from "@/games/wow-forever/lib/writs/writTurnInSummary";
import { writViewFromParams, writViewToParams } from "@/games/wow-forever/lib/writs/writViewParams";
import type { WritFilters } from "@/games/wow-forever/types/writs/writFilters";
import type { WritRecord } from "@/games/wow-forever/types/writs/writRecord";
import type { WritSort } from "@/games/wow-forever/types/writs/writSort";
import type { WritTier } from "@/games/wow-forever/types/writs/writTier";
import type { WritTurnIn } from "@/games/wow-forever/types/writs/writTurnIn";
import type { WritsFile } from "@/games/wow-forever/types/writs/writsFile";

function writ(id: number, name: string, tier: WritTier, productId: number | null): WritRecord {
  return {
    id,
    name: `Craftsman's Writ: ${name}`,
    tier,
    questId: id + 1000,
    productName: name,
    product: productId === null ? null : { id: productId, name },
  };
}

function turnIn(zone: string, faction: WritTurnIn["faction"] = "alliance"): WritTurnIn {
  return { zone, map: 1, x: 12.34, y: 56.78, seen: "2026-11-19", faction };
}

const FILE: WritsFile = {
  build: "1",
  attribution: "",
  writs: [
    writ(1, "Alpha", "journeyman", 101), // 40 + 10 = 50 -> not a deal (not strictly under 50s)
    writ(2, "Bravo", "journeyman", 102), // 20 + 20 = 40 -> deal
    writ(3, "Charlie", "expert", 103), // 9000 + 900 -> deal (under 1g)
    writ(4, "Delta", "expert", 104), // 9000 + 1000 = 10000 -> not a deal
    writ(5, "Echo", "artisan", 105), // 19999 -> deal
    writ(6, "Foxtrot", "artisan", null), // unknown item -> no total
    writ(7, "Golf", "journeyman", 107), // item has no price -> no total
  ],
  turnIns: { "1002": [turnIn("Ironforge")], "1003": [turnIn("Orgrimmar", "horde"), turnIn("Stormwind")] },
};

const PRICES = new Map<number, number>([
  [1, 4000],
  [101, 1000],
  [2, 20],
  [102, 20],
  [3, 9000],
  [103, 900],
  [4, 9000],
  [104, 1000],
  [5, 10000],
  [105, 9999],
  [6, 100],
  [7, 100],
]);

const rows = buildWritRows(FILE, (id) => PRICES.get(id), "alliance");
const byName = (name: string) => rows.find((r) => r.writ.name.endsWith(name));
const NONE: WritFilters = { tier: null, location: null, dealsOnly: false };
const names = (list: typeof rows) => list.map((r) => r.writ.name.replace("Craftsman's Writ: ", ""));

describe("buildWritRows", () => {
  it("totals writ + item only when both are known", () => {
    expect(byName("Alpha")?.total).toBe(5000);
    expect(byName("Foxtrot")?.total).toBeNull();
    expect(byName("Golf")?.total).toBeNull();
    expect(byName("Golf")?.writPrice).toBe(100);
    expect(byName("Golf")?.itemPrice).toBeNull();
  });

  it("has no total for any row when no prices are known", () => {
    const empty = buildWritRows(FILE, () => undefined, null);
    expect(empty.every((r) => r.total === null && !r.deal)).toBe(true);
  });
});

describe("isWritDeal", () => {
  it("is strictly under each tier's threshold", () => {
    expect(isWritDeal("journeyman", 4999)).toBe(true);
    expect(isWritDeal("journeyman", 5000)).toBe(false);
    expect(isWritDeal("expert", 9999)).toBe(true);
    expect(isWritDeal("expert", 10000)).toBe(false);
    expect(isWritDeal("artisan", 19999)).toBe(true);
    expect(isWritDeal("artisan", 20000)).toBe(false);
  });

  it("is never true for an unknown total", () => {
    expect(isWritDeal("journeyman", null)).toBe(false);
    expect(byName("Foxtrot")?.deal).toBe(false);
  });

  it("marks the deal rows", () => {
    expect(names(rows.filter((r) => r.deal))).toEqual(["Bravo", "Charlie", "Echo"]);
  });
});

describe("summarizeTurnIn", () => {
  it("is null with nothing recorded", () => {
    expect(summarizeTurnIn(undefined, "alliance")).toBeNull();
    expect(summarizeTurnIn([], "alliance")).toBeNull();
  });

  it("prefers the player's faction, else the first, and rounds the coordinates", () => {
    const records = [turnIn("Orgrimmar", "horde"), turnIn("Stormwind", "alliance")];
    expect(summarizeTurnIn(records, "alliance")?.zone).toBe("Stormwind");
    expect(summarizeTurnIn(records, null)?.zone).toBe("Orgrimmar");
    expect(summarizeTurnIn(records, "horde")?.coords).toBe("12.3, 56.8");
    expect(summarizeTurnIn(records, "horde")?.seenOn).toBeTruthy();
  });
});

describe("sortWritRows", () => {
  it("orders by total ascending with unknown totals last", () => {
    expect(names(sortWritRows(rows, { key: "total", direction: "asc" }))).toEqual([
      "Bravo",
      "Alpha",
      "Charlie",
      "Delta",
      "Echo",
      "Foxtrot",
      "Golf",
    ]);
  });

  it("keeps unknown totals last when descending", () => {
    expect(names(sortWritRows(rows, { key: "total", direction: "desc" }))).toEqual([
      "Echo",
      "Delta",
      "Charlie",
      "Alpha",
      "Bravo",
      "Foxtrot",
      "Golf",
    ]);
  });

  it("orders by tier journeyman < expert < artisan, then by name", () => {
    const sorted = sortWritRows(rows, { key: "tier", direction: "asc" });
    expect(names(sorted)).toEqual(["Alpha", "Bravo", "Golf", "Charlie", "Delta", "Echo", "Foxtrot"]);
  });

  it("orders by name and by the two price columns, unknowns last either way", () => {
    expect(names(sortWritRows(rows, { key: "name", direction: "desc" }))[0]).toBe("Golf");
    const itemAsc: WritSort = { key: "itemPrice", direction: "asc" };
    expect(names(sortWritRows(rows, itemAsc)).slice(-2)).toEqual(["Foxtrot", "Golf"]);
    expect(names(sortWritRows(rows, { key: "writPrice", direction: "desc" }))[0]).toBe("Echo");
  });

  it("does not change the input", () => {
    const before = names(rows);
    sortWritRows(rows, { key: "total", direction: "desc" });
    expect(names(rows)).toEqual(before);
  });
});

describe("filterWritRows and facets", () => {
  it("filters by tier, location and deals", () => {
    expect(names(filterWritRows(rows, { ...NONE, tier: "expert" }))).toEqual(["Charlie", "Delta"]);
    expect(names(filterWritRows(rows, { ...NONE, location: "Ironforge" }))).toEqual(["Bravo"]);
    expect(names(filterWritRows(rows, { ...NONE, location: "unknown" }))).toHaveLength(5);
    expect(names(filterWritRows(rows, { ...NONE, dealsOnly: true }))).toEqual(["Bravo", "Charlie", "Echo"]);
    expect(names(filterWritRows(rows, { tier: "journeyman", location: null, dealsOnly: true }))).toEqual(["Bravo"]);
  });

  it("counts tiers with the other filters applied", () => {
    expect(tierCounts(rows, NONE)).toEqual({ all: 7, journeyman: 3, expert: 2, artisan: 2 });
    expect(tierCounts(rows, { ...NONE, dealsOnly: true, tier: "artisan" })).toEqual({ all: 3, journeyman: 1, expert: 1, artisan: 1 });
  });

  it("lists recorded zones A-Z then Not known yet, with counts", () => {
    // Stormwind is the alliance turn-in of quest 1003 (writ 3); the player is alliance.
    expect(locationOptions(rows, NONE)).toEqual([
      { value: "Ironforge", label: "Ironforge", count: 1 },
      { value: "Stormwind", label: "Stormwind", count: 1 },
      { value: "unknown", label: "Not known yet", count: 5 },
    ]);
    expect(locationOptions(rows, { ...NONE, dealsOnly: true }).map((o) => o.count)).toEqual([1, 1, 1]);
    expect(knownLocations(rows)).toEqual(["Ironforge", "Stormwind", "unknown"]);
  });
});

describe("writViewFromParams / writViewToParams", () => {
  const known = knownLocations(rows);

  it("reads defaults from an empty link", () => {
    expect(writViewFromParams(new URLSearchParams(), known)).toEqual({
      filters: NONE,
      sort: { key: "total", direction: "asc" },
    });
  });

  it("reads every param", () => {
    const view = writViewFromParams(new URLSearchParams("tier=expert&loc=Ironforge&deals=1&sort=name&dir=desc"), known);
    expect(view).toEqual({
      filters: { tier: "expert", location: "Ironforge", dealsOnly: true },
      sort: { key: "name", direction: "desc" },
    });
  });

  it("ignores values that are not allowed", () => {
    const view = writViewFromParams(new URLSearchParams("tier=legendary&loc=Nowhere&deals=yes&sort=bogus&dir=sideways"), known);
    expect(view).toEqual({ filters: NONE, sort: { key: "total", direction: "asc" } });
  });

  it("writes only what differs from the defaults and leaves other params alone", () => {
    const params = writViewToParams(new URLSearchParams("house=neutral"), {
      filters: { tier: "artisan", location: null, dealsOnly: true },
      sort: { key: "total", direction: "desc" },
    });
    expect(params.toString()).toBe("house=neutral&tier=artisan&deals=1&dir=desc");
  });

  it("removes params when the view goes back to defaults", () => {
    const params = writViewToParams(new URLSearchParams("tier=expert&loc=unknown&deals=1&sort=tier&dir=desc&house=horde"), {
      filters: NONE,
      sort: { key: "total", direction: "asc" },
    });
    expect(params.toString()).toBe("house=horde");
  });
});
