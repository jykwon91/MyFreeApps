import { describe, expect, it } from "vitest";
import raresJson from "@/games/wow-forever/data/rares/rares.json";
import rareSpawnsJson from "@/games/wow-forever/data/rares/classic/rareSpawns.json";
import { RARE_CLASSIFICATION } from "@/games/wow-forever/data/rares/raresConfig";
import { MAP_LAYER } from "@/games/wow-forever/data/worldMap/mapLayerIds";
import { WORLD_MAP_PAGE_PATH } from "@/games/wow-forever/data/worldMap/mapMarks";
import { decodeRares } from "@/games/wow-forever/lib/rares/decodeRares";
import { filterRares, fitsLevel } from "@/games/wow-forever/lib/rares/filterRares";
import {
  DEFAULT_RARE_FILTERS,
  isDefaultRareFilters,
  parseRareFilters,
  toLevel,
  writeRareFilters,
} from "@/games/wow-forever/lib/rares/rareFilterParams";
import { fitSpots, mainRareZone, rareMapHref } from "@/games/wow-forever/lib/rares/rareMapHref";
import { rareIdOfMarker, rareMarkerId } from "@/games/wow-forever/lib/rares/rareMarkerId";
import { rareLevelText, rareMarkerLabel, rareWhereText } from "@/games/wow-forever/lib/rares/rareText";
import { targetLine, targetMacros } from "@/games/wow-forever/lib/rares/targetMacros";
import type { Rare } from "@/games/wow-forever/types/rares/rare";
import type { RareDataFiles } from "@/games/wow-forever/types/rares/rareDataFiles";
import type { RareSpawn } from "@/games/wow-forever/types/rares/rareSpawn";
import { decodeMapViewFragment } from "@/games/wow-forever/worldMap/mapViewShare";

const data = decodeRares({ forever: raresJson, classic: rareSpawnsJson } as unknown as RareDataFiles);
const ELWYNN = 1429;
const REDRIDGE = 1433;

function spawn(zoneId: number, x: number, y: number, subzone = ""): RareSpawn {
  return { zoneId, zoneName: zoneId === ELWYNN ? "Elwynn Forest" : "Redridge Mountains", subzone, x, y };
}

function rare(overrides: Partial<Rare>): Rare {
  return {
    id: 1,
    name: "Test Rare",
    classification: RARE_CLASSIFICATION.rare,
    classic: true,
    seenOn: null,
    minLevel: 10,
    maxLevel: 10,
    spawns: [spawn(ELWYNN, 50, 50)],
    drops: [],
    ...overrides,
  };
}

function byId(id: number): Rare {
  const found = data.rares.find((r) => r.id === id);
  if (!found) throw new Error(`no rare ${id}`);
  return found;
}

describe("decodeRares (committed data)", () => {
  it("joins Forever names and classifications with Classic levels, spawns and drops", () => {
    const morgaine = byId(99);
    expect(morgaine.name).toBe("Morgaine the Sly");
    expect(morgaine.classification).toBe(RARE_CLASSIFICATION.rare);
    expect(morgaine.classic).toBe(true);
    expect(morgaine.seenOn).toBe(raresJson.rares.find((r) => r[0] === 99)?.[3]);
    expect(morgaine.minLevel).toBe(10);
    expect(morgaine.spawns.every((s) => s.zoneId === ELWYNN && s.zoneName === "Elwynn Forest")).toBe(true);
    expect(morgaine.drops[0]).toMatchObject({ id: 6201, name: "Lithe Boots" });
  });

  it("lists every Classic rare, unconfirmed ones with their Classic name and rank", () => {
    expect(data.rares.length).toBe(new Set([...Object.keys(rareSpawnsJson.rares), ...raresJson.rares.map((r) => String(r[0]))]).size);
    expect(data.rares.filter((r) => r.seenOn !== null)).toHaveLength(raresJson.rares.length);
    const digger = byId(1424);
    expect(digger).toMatchObject({ name: "Master Digger", classification: RARE_CLASSIFICATION.rare, classic: true, seenOn: null });
    expect(digger.spawns[0].zoneName).toBe("Westfall");
    expect(data.rares.some((r) => r.classification === RARE_CLASSIFICATION.rareElite && r.seenOn === null)).toBe(true);
  });

  it("keeps rares new in Forever with no level, spawns or drops", () => {
    const kackle = byId(210107);
    expect(kackle.classic).toBe(false);
    expect(kackle.seenOn).toBe(raresJson.rares.find((r) => r[0] === 210107)?.[3]);
    expect(kackle.minLevel).toBeNull();
    expect(kackle.spawns).toEqual([]);
    expect(kackle.drops).toEqual([]);
  });

  it("sorts lowest level first, rares with no level last", () => {
    const levels = data.rares.map((r) => r.minLevel ?? Number.POSITIVE_INFINITY);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(data.rares[data.rares.length - 1].minLevel).toBeNull();
  });

  it("lists only zones a rare spawns in, by name", () => {
    expect(data.zones.map((z) => z.name)).toContain("Elwynn Forest");
    const spawnZones = new Set(data.rares.flatMap((r) => r.spawns.map((s) => s.zoneId)));
    expect(data.zones.every((z) => spawnZones.has(z.id))).toBe(true);
  });
});

describe("filterRares", () => {
  const low = rare({ id: 1, minLevel: 10, maxLevel: 10 });
  const mid = rare({ id: 2, minLevel: 24, maxLevel: 26, spawns: [spawn(REDRIDGE, 10, 10)] });
  const unknown = rare({ id: 3, classic: false, seenOn: "2026-11-07", minLevel: null, maxLevel: null, spawns: [] });
  const all = [low, mid, unknown];

  it("keeps everything with no filters, in order", () => {
    expect(filterRares(all, DEFAULT_RARE_FILTERS, null)).toEqual(all);
  });

  it("confirmed in Forever keeps only rares the client has met", () => {
    expect(filterRares(all, { ...DEFAULT_RARE_FILTERS, confirmedOnly: true }, null)).toEqual([unknown]);
    expect(filterRares(all, { ...DEFAULT_RARE_FILTERS, confirmedOnly: true, zoneId: REDRIDGE }, null)).toEqual([]);
  });

  it("filters by zone", () => {
    expect(filterRares(all, { ...DEFAULT_RARE_FILTERS, zoneId: REDRIDGE }, null)).toEqual([mid]);
  });

  it("filters by an overlapping level range and drops rares with no level", () => {
    expect(filterRares(all, { ...DEFAULT_RARE_FILTERS, minLevel: 26 }, null)).toEqual([mid]);
    expect(filterRares(all, { ...DEFAULT_RARE_FILTERS, maxLevel: 24 }, null)).toEqual([low, mid]);
    expect(filterRares(all, { ...DEFAULT_RARE_FILTERS, minLevel: 11, maxLevel: 23 }, null)).toEqual([]);
  });

  it("fits my level: 3 below to 2 above, and does nothing without a level", () => {
    const fit = { ...DEFAULT_RARE_FILTERS, fitsMyLevel: true };
    expect(filterRares(all, fit, 12)).toEqual([low]);
    expect(filterRares(all, fit, 13)).toEqual([low]);
    expect(filterRares(all, fit, 14)).toEqual([]);
    expect(filterRares(all, fit, 8)).toEqual([low]);
    expect(filterRares(all, fit, 7)).toEqual([]);
    expect(filterRares(all, fit, null)).toEqual(all);
    expect(fitsLevel(unknown, 10)).toBe(false);
  });
});

describe("rare filter URL params", () => {
  it("round-trips and leaves unset filters out", () => {
    const filters = { zoneId: ELWYNN, minLevel: 5, maxLevel: 20, fitsMyLevel: true, confirmedOnly: true };
    const params = writeRareFilters(new URLSearchParams("keep=1"), filters);
    expect(params.toString()).toBe("keep=1&zone=1429&min=5&max=20&fit=1&confirmed=1");
    expect(parseRareFilters(params)).toEqual(filters);
    expect(writeRareFilters(params, DEFAULT_RARE_FILTERS).toString()).toBe("keep=1");
  });

  it("reads malformed values as no filter", () => {
    expect(parseRareFilters(new URLSearchParams("zone=abc&min=0&max=99&fit=yes&confirmed=true"))).toEqual(DEFAULT_RARE_FILTERS);
    expect(isDefaultRareFilters(DEFAULT_RARE_FILTERS)).toBe(true);
    expect(isDefaultRareFilters({ ...DEFAULT_RARE_FILTERS, fitsMyLevel: true })).toBe(false);
    expect(isDefaultRareFilters({ ...DEFAULT_RARE_FILTERS, confirmedOnly: true })).toBe(false);
  });

  it("rounds typed levels and rejects ones outside the game", () => {
    expect(toLevel(12.4)).toBe(12);
    expect(toLevel(0)).toBeNull();
    expect(toLevel(64)).toBeNull();
    expect(toLevel(null)).toBeNull();
  });
});

describe("targetMacros", () => {
  it("writes one /target line per name", () => {
    expect(targetLine("Morgaine the Sly")).toBe("/target Morgaine the Sly");
    const [only] = targetMacros(["A", "B"]);
    expect(only.text).toBe("/target A\n/target B");
    expect(only.length).toBe(only.text.length);
  });

  it("splits into macros of at most 255 characters, in order, counting the line break", () => {
    const names = Array.from({ length: 30 }, (_, i) => `Rare Number ${String(i).padStart(2, "0")}`);
    const macros = targetMacros(names);
    expect(macros.length).toBeGreaterThan(1);
    expect(macros.every((m) => m.length <= 255 && m.text.length === m.length)).toBe(true);
    expect(macros.flatMap((m) => m.names)).toEqual(names);
    // Packed greedily: the next name would not have fitted.
    for (let i = 0; i < macros.length - 1; i += 1) {
      expect(macros[i].length + 1 + targetLine(macros[i + 1].names[0]).length).toBeGreaterThan(255);
    }
  });

  it("fits exactly at the limit", () => {
    // "/target " is 8 characters: two 10-character lines + the break = 21.
    expect(targetMacros(["ab", "cd"], 21)).toHaveLength(1);
    expect(targetMacros(["ab", "cd"], 20)).toHaveLength(2);
  });

  it("targets a repeated name once, gives an oversize line its own macro, and makes nothing from nothing", () => {
    expect(targetMacros(["A", "A"])[0].names).toEqual(["A"]);
    const long = "x".repeat(300);
    const macros = targetMacros(["A", long, "B"]);
    expect(macros.map((m) => m.names)).toEqual([["A"], [long], ["B"]]);
    expect(targetMacros([])).toEqual([]);
  });
});

describe("rare text", () => {
  it("level, marker label and where", () => {
    expect(rareLevelText(rare({}))).toBe("Level 10");
    expect(rareLevelText(rare({ minLevel: 24, maxLevel: 26 }))).toBe("Level 24–26");
    expect(rareLevelText(rare({ minLevel: null, maxLevel: null }))).toBeNull();
    expect(rareMarkerLabel(rare({ classification: RARE_CLASSIFICATION.rareElite }))).toBe("Test Rare — level 10 rare elite");
    expect(rareWhereText(rare({ spawns: [spawn(ELWYNN, 1, 1, "Forest's Edge")] }))).toBe("Forest's Edge, Elwynn Forest");
    expect(rareWhereText(rare({ spawns: [spawn(ELWYNN, 1, 1, "A"), spawn(ELWYNN, 2, 2, "B")] }))).toBe("Elwynn Forest · 2 spots");
    expect(rareWhereText(rare({ spawns: [spawn(ELWYNN, 1, 1), spawn(REDRIDGE, 2, 2)] }))).toBe("2 zones · 2 spots");
    expect(rareWhereText(rare({ spawns: [] }))).toBeNull();
  });

  it("marker ids round-trip and other markers aren't rares", () => {
    expect(rareIdOfMarker(rareMarkerId(99, 3))).toBe(99);
    expect(rareIdOfMarker("npc:99")).toBeNull();
    expect(rareIdOfMarker(null)).toBeNull();
  });
});

describe("rareMapHref", () => {
  it("opens the zone with most spots, zoomed to them, with a mark on each and the Rares layer on", () => {
    const r = rare({ spawns: [spawn(REDRIDGE, 10, 10), spawn(ELWYNN, 40, 40), spawn(ELWYNN, 60, 50)] });
    expect(mainRareZone(r.spawns)).toBe(ELWYNN);
    const href = rareMapHref(r);
    expect(href?.startsWith(`${WORLD_MAP_PAGE_PATH}?m=${ELWYNN}#`)).toBe(true);
    const view = decodeMapViewFragment(href!.slice(href!.indexOf("#")));
    expect(view?.mapId).toBe(ELWYNN);
    expect(view?.layers[MAP_LAYER.rares]).toBe(true);
    expect(view?.marks.marks.map((m) => [m.x, m.y, m.label])).toEqual([
      [40, 40, "Test Rare"],
      [60, 50, "Test Rare"],
    ]);
  });

  it("is null for a rare with no spots, and fits a single spot at the zoom cap", () => {
    expect(rareMapHref(rare({ spawns: [] }))).toBeNull();
    expect(fitSpots([{ x: 50, y: 25 }])).toEqual({ scale: 3, centerX: 0.5, centerY: 0.25 });
  });

  it("every committed rare with spawns has a working link", () => {
    for (const r of data.rares.filter((x) => x.spawns.length > 0)) {
      const href = rareMapHref(r)!;
      expect(decodeMapViewFragment(href.slice(href.indexOf("#")))).not.toBeNull();
    }
  });
});
