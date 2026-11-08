import { describe, expect, it } from "vitest";
import racesJson from "@/games/wow-forever/data/races/races.json";
import classicRacialsJson from "@/games/wow-forever/data/races/classic/racials.json";
import { RACIAL_STATUS, RACIAL_STATUS_ORDER } from "@/games/wow-forever/data/races/racesConfig";
import { decodeRaces } from "@/games/wow-forever/lib/races/decodeRaces";
import { filterRaces, raceFilterCounts, shownRacialCount } from "@/games/wow-forever/lib/races/filterRaces";
import { raceClassNames } from "@/games/wow-forever/lib/races/raceClassNames";
import {
  DEFAULT_RACE_FILTERS,
  isDefaultRaceFilters,
  parseRaceFilters,
  writeRaceFilters,
} from "@/games/wow-forever/lib/races/raceFilterParams";
import type { RacesDataFiles } from "@/games/wow-forever/types/races/racesDataFiles";

const files = { forever: racesJson, classic: classicRacialsJson } as unknown as RacesDataFiles;
const data = decodeRaces(files);
const allRacials = data.races.flatMap((r) => r.racials);
const counts = (racesJson as unknown as { counts: Record<string, number> }).counts;

describe("decodeRaces on the committed data", () => {
  it("matches the generator's counts", () => {
    expect(data.races).toHaveLength(counts.races);
    expect(allRacials).toHaveLength(counts.racials);
    for (const status of RACIAL_STATUS_ORDER) {
      expect(allRacials.filter((r) => r.status === status)).toHaveLength(counts[status]);
    }
  });

  it("has unique race slugs and racial keys (they're anchors and links)", () => {
    const anchors = [...data.races.map((r) => r.slug), ...allRacials.map((r) => r.key)];
    expect(new Set(anchors).size).toBe(anchors.length);
    for (const race of data.races) {
      for (const racial of race.racials) expect(racial.key.startsWith(`${race.slug}-`)).toBe(true);
    }
  });

  it("gives every changed and removed racial its Classic text, and no other racial any", () => {
    for (const racial of allRacials) {
      const needsClassic = racial.status === RACIAL_STATUS.changed || racial.status === RACIAL_STATUS.removed;
      if (needsClassic) expect(racial.classicVariants?.length, racial.key).toBeGreaterThan(0);
      else expect(racial.classicVariants, racial.key).toBeNull();
      if (racial.status === RACIAL_STATUS.removed) expect(racial.variants).toHaveLength(0);
      else expect(racial.variants.length, racial.key).toBeGreaterThan(0);
    }
  });

  it("orders Alliance before Horde, new races last in each, and tags start zones", () => {
    expect(data.races.map((r) => r.slug)).toEqual([
      "human",
      "dwarf",
      "night-elf",
      "gnome",
      "high-order-skyborne",
      "orc",
      "undead",
      "tauren",
      "troll",
      "windshaper-skyborne",
    ]);
    const human = data.races[0];
    expect(human.startZone).toEqual({ name: "Elwynn Forest", uiMapId: 1429, basis: "classic" });
    const skyborne = data.races.find((r) => r.slug === "high-order-skyborne");
    expect(skyborne?.newInForever).toBe(true);
    expect(skyborne?.startZone?.basis).toBe("unconfirmed");
  });

  it("marks only the racials with a value missing from the game files as partial, shown as ?", () => {
    const partial = allRacials.filter((r) => r.partial).map((r) => r.key);
    expect(partial.sort()).toEqual(["dwarf-find-treasure", "tauren-war-stomp", "troll-berserking"]);
    const stomp = allRacials.find((r) => r.key === "tauren-war-stomp");
    expect(stomp?.variants[0].text).toContain("?");
  });

  it("throws on a class, faction or status the page doesn't know", () => {
    const bad = structuredClone(racesJson) as unknown as { races: { faction: string }[] };
    bad.races[0].faction = "pirates";
    expect(() => decodeRaces({ ...files, forever: bad } as unknown as RacesDataFiles)).toThrow(/faction "pirates"/);
  });
});

describe("filterRaces", () => {
  it("returns every race whole with no filter", () => {
    const shown = filterRaces(data.races, DEFAULT_RACE_FILTERS);
    expect(shown).toHaveLength(data.races.length);
    expect(shownRacialCount(shown)).toBe(allRacials.length);
  });

  it("filters by faction and class", () => {
    const horde = filterRaces(data.races, { ...DEFAULT_RACE_FILTERS, faction: "horde" });
    expect(horde.every((r) => r.faction === "horde")).toBe(true);
    const paladins = filterRaces(data.races, { ...DEFAULT_RACE_FILTERS, classId: "paladin" });
    expect(paladins.map((r) => r.slug).sort()).toEqual(["dwarf", "human", "undead"]);
  });

  it("keeps only matching racials and drops races left with none", () => {
    const unchanged = filterRaces(data.races, { ...DEFAULT_RACE_FILTERS, status: "unchanged" });
    expect(unchanged.map((r) => r.slug)).toEqual(["human", "orc", "undead", "tauren", "troll"]);
    expect(shownRacialCount(unchanged)).toBe(counts.unchanged);
  });

  it("Only changed hides the unchanged racials and keeps the removed ones", () => {
    const shown = filterRaces(data.races, { ...DEFAULT_RACE_FILTERS, changedOnly: true });
    const racials = shown.flatMap((r) => r.racials);
    expect(racials.some((r) => r.status === RACIAL_STATUS.unchanged)).toBe(false);
    expect(racials.filter((r) => r.status === RACIAL_STATUS.removed)).toHaveLength(counts.removed);
    expect(racials).toHaveLength(counts.racials - counts.unchanged);
  });

  it("counts each chip as the list would be with it picked", () => {
    const none = raceFilterCounts(data.races, DEFAULT_RACE_FILTERS);
    expect(none.faction).toEqual({ alliance: 5, horde: 5 });
    expect(none.status).toEqual({
      changed: counts.changed,
      new: counts.new,
      removed: counts.removed,
      unchanged: counts.unchanged,
    });
    expect(none.changed).toBe(counts.racials - counts.unchanged);

    const horde = raceFilterCounts(data.races, { ...DEFAULT_RACE_FILTERS, faction: "horde" });
    const hordeRacials = data.races.filter((r) => r.faction === "horde").flatMap((r) => r.racials);
    expect(horde.status.unchanged).toBe(hordeRacials.filter((r) => r.status === "unchanged").length);
    // A faction chip counts races, with the other filters applied.
    const unchangedOnly = raceFilterCounts(data.races, { ...DEFAULT_RACE_FILTERS, status: "unchanged" });
    expect(unchangedOnly.faction).toEqual({ alliance: 1, horde: 4 });
  });
});

describe("race filter params", () => {
  it("round-trips through the URL and leaves defaults out", () => {
    const filters = { faction: "alliance", classId: "mage", status: "changed", changedOnly: true } as const;
    const params = writeRaceFilters(new URLSearchParams("keep=1"), filters);
    expect(params.toString()).toBe("keep=1&faction=alliance&class=mage&status=changed&changed=1");
    expect(parseRaceFilters(params)).toEqual(filters);
    expect(writeRaceFilters(params, DEFAULT_RACE_FILTERS).toString()).toBe("keep=1");
  });

  it("reads anything malformed as no filter", () => {
    const filters = parseRaceFilters(new URLSearchParams("faction=pirates&class=bard&status=gone&changed=yes"));
    expect(filters).toEqual(DEFAULT_RACE_FILTERS);
    expect(isDefaultRaceFilters(filters)).toBe(true);
    expect(isDefaultRaceFilters({ ...DEFAULT_RACE_FILTERS, changedOnly: true })).toBe(false);
  });
});

it("names classes as the game does", () => {
  expect(raceClassNames(["warrior", "rogue"])).toBe("Warrior, Rogue");
});
