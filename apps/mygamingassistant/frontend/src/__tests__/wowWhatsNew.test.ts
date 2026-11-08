import { afterEach, describe, expect, it } from "vitest";
import { WHATS_NEW } from "@/games/wow-forever/data/whatsNew";
import { WOW_HUB_PATH, WOW_PAGE_PATHS } from "@/games/wow-forever/data/wowPagePaths";
import { clientBuildLabel } from "@/games/wow-forever/lib/whatsNew/clientBuildLabel";
import { createPageVisitStore } from "@/games/wow-forever/lib/whatsNew/pageVisitStore";
import {
  entryKey,
  entryPage,
  pageForPathname,
  pagesWithUpdates,
  parsePageVisits,
  withVisit,
} from "@/games/wow-forever/lib/whatsNew/updateDots";
import type { WhatsNewEntry } from "@/games/wow-forever/types/whatsNew/whatsNewEntry";

const GEAR: WhatsNewEntry = { date: "2026-11-10", title: "Gear", summary: "s", to: "/wow-forever/gear?view=mine" };
const MAP: WhatsNewEntry = { date: "2026-11-01", title: "Map", summary: "s", to: "/wow-forever/map" };
const SAME_DAY_GEAR: WhatsNewEntry = { date: "2026-11-01", title: "More gear", summary: "s", to: "/wow-forever/gear" };

describe("update dots", () => {
  it("shows no dots on a first-ever visit", () => {
    expect(pagesWithUpdates([GEAR, MAP], null).size).toBe(0);
    const visits = withVisit(null, "/wow-forever", [GEAR, MAP]);
    expect(pagesWithUpdates([GEAR, MAP], visits).size).toBe(0);
  });

  it("dots a page for an entry added after the first visit, and visiting it clears the dot", () => {
    let visits = withVisit(null, "/wow-forever", [MAP]);
    expect([...pagesWithUpdates([GEAR, MAP], visits)]).toEqual(["/wow-forever/gear"]);
    visits = withVisit(visits, "/wow-forever/gear", [GEAR, MAP]);
    expect(pagesWithUpdates([GEAR, MAP], visits).size).toBe(0);
  });

  it("an entry shipped later the same day still dots a page visited that morning", () => {
    let visits = withVisit(null, "/wow-forever", [MAP]);
    visits = withVisit(visits, "/wow-forever/gear", [MAP]);
    expect([...pagesWithUpdates([MAP, SAME_DAY_GEAR], visits)]).toEqual(["/wow-forever/gear"]);
  });

  it("a page's visit only clears that page", () => {
    let visits = withVisit(null, "/wow-forever", []);
    visits = withVisit(visits, "/wow-forever/map", [GEAR, MAP]);
    expect(pagesWithUpdates([GEAR, MAP], visits)).toEqual(new Set(["/wow-forever/gear"]));
  });

  it("a repeat visit with nothing new returns the same record", () => {
    const visits = withVisit(withVisit(null, "/wow-forever", [MAP]), "/wow-forever/map", [MAP]);
    expect(withVisit(visits, "/wow-forever/map", [MAP])).toBe(visits);
  });

  it("drops a malformed stored value, and malformed page lists inside one", () => {
    expect(parsePageVisits(null)).toBeNull();
    expect(parsePageVisits({ pages: {} })).toBeNull();
    expect(parsePageVisits({ firstVisit: "2026-11-01T00:00:00Z", pages: {} })).toBeNull();
    expect(parsePageVisits({ baseline: [1], pages: {} })).toBeNull();
    expect(parsePageVisits({ baseline: ["a"], pages: { "/a": ["b"], "/b": 3, "/c": [4] } })).toEqual({
      baseline: ["a"],
      pages: { "/a": ["b"] },
    });
  });

  it("an entry's page is its link without the query, and its key is date + title", () => {
    expect(entryPage(GEAR)).toBe("/wow-forever/gear");
    expect(entryKey(GEAR)).toBe("2026-11-10|Gear");
  });

  it("maps a location to the page it visits", () => {
    expect(pageForPathname("/wow-forever", WOW_PAGE_PATHS, WOW_HUB_PATH)).toBe("/wow-forever");
    expect(pageForPathname("/wow-forever/", WOW_PAGE_PATHS, WOW_HUB_PATH)).toBe("/wow-forever");
    expect(pageForPathname("/wow-forever/food/123", WOW_PAGE_PATHS, WOW_HUB_PATH)).toBe("/wow-forever/food");
    // An item page sits under the Items tile, like a food page under the food picker.
    expect(pageForPathname("/wow-forever/items/19", WOW_PAGE_PATHS, WOW_HUB_PATH)).toBe("/wow-forever/items");
    expect(pageForPathname("/wow-forever/triage", WOW_PAGE_PATHS, WOW_HUB_PATH)).toBeNull();
    expect(pageForPathname("/wow-forever/gearx", WOW_PAGE_PATHS, WOW_HUB_PATH)).toBeNull();
    expect(pageForPathname("/", WOW_PAGE_PATHS, WOW_HUB_PATH)).toBeNull();
  });
});

describe("page visit store", () => {
  const KEY = "test.pageVisits.v1";
  afterEach(() => window.localStorage.clear());

  it("persists visits and tells subscribers", () => {
    const store = createPageVisitStore(KEY, [GEAR, MAP]);
    let calls = 0;
    const unsubscribe = store.subscribe(() => (calls += 1));
    expect(store.getSnapshot()).toBeNull();
    store.recordVisit("/wow-forever/map");
    expect(calls).toBe(1);
    unsubscribe();
    expect(createPageVisitStore(KEY, [GEAR, MAP]).getSnapshot()?.pages["/wow-forever/map"]).toEqual([entryKey(MAP)]);
  });

  it("returns the same snapshot until something changes, and a repeat visit doesn't notify", () => {
    const store = createPageVisitStore(KEY, [MAP]);
    store.recordVisit("/wow-forever/map");
    const before = store.getSnapshot();
    let calls = 0;
    store.subscribe(() => (calls += 1));
    store.recordVisit("/wow-forever/map");
    expect(store.getSnapshot()).toBe(before);
    expect(calls).toBe(0);
  });

  it("never undoes a visit another tab saved", () => {
    const tabA = createPageVisitStore(KEY, [GEAR, MAP]);
    const tabB = createPageVisitStore(KEY, [GEAR, MAP]);
    tabA.recordVisit("/wow-forever");
    tabB.recordVisit("/wow-forever/map");
    tabA.recordVisit("/wow-forever/gear");
    const stored = createPageVisitStore(KEY, [GEAR, MAP]).getSnapshot();
    expect(Object.keys(stored?.pages ?? {}).sort()).toEqual(["/wow-forever", "/wow-forever/gear", "/wow-forever/map"]);
  });

  it("reloads when another tab saves", () => {
    const store = createPageVisitStore(KEY, [GEAR, MAP]);
    let calls = 0;
    store.subscribe(() => (calls += 1));
    expect(store.getSnapshot()).toBeNull();
    createPageVisitStore(KEY, [GEAR, MAP]).recordVisit("/wow-forever");
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    expect(calls).toBe(1);
    expect(store.getSnapshot()?.pages["/wow-forever"]).toEqual([]);
  });
});

describe("What's new data", () => {
  it("is newest first with real dates", () => {
    const dates = WHATS_NEW.map((e) => e.date);
    for (const date of dates) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("every entry links to the hub or a hub tile, so its dot has somewhere to show", () => {
    for (const entry of WHATS_NEW) expect(WOW_PAGE_PATHS).toContain(entryPage(entry));
  });

  it("no two entries share a date and title, so each is remembered separately", () => {
    const keys = WHATS_NEW.map(entryKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("data refresh line", () => {
  it("reads a build as a patch", () => {
    expect(clientBuildLabel("1.60.1.70790")).toBe("patch 1.60.1 (build 70790)");
    expect(clientBuildLabel("weird")).toBe("build weird");
  });
});
