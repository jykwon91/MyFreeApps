import { describe, expect, it } from "vitest";
import { WOW_CLASSES, findClass, type WowClassId } from "@/games/wow-forever/data/classes";
import classDetailsRaw from "@/games/wow-forever/data/classes/classDetails.json";
import racesJson from "@/games/wow-forever/data/races/races.json";
import classicRacialsJson from "@/games/wow-forever/data/races/classic/racials.json";
import { decodeRaces } from "@/games/wow-forever/lib/races/decodeRaces";
import { racesForClass } from "@/games/wow-forever/lib/classes/classRaces";
import { classChangesFor } from "@/games/wow-forever/lib/changes/classChangesFor";
import type { ClassDetailsFile } from "@/games/wow-forever/types/classes/classDetailsFile";
import type { RacesDataFiles } from "@/games/wow-forever/types/races/racesDataFiles";
import type { ChangeEntry } from "@/games/wow-forever/types/changes/changeEntry";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

const CLASS_DETAILS = (classDetailsRaw as unknown as ClassDetailsFile).classes;
const racesFiles = { forever: racesJson, classic: classicRacialsJson } as unknown as RacesDataFiles;
const racesData = decodeRaces(racesFiles);

describe("classDetails.json committed data", () => {
  it("has an entry for all nine classes", () => {
    const slugs = WOW_CLASSES.map((c) => c.id);
    for (const slug of slugs) {
      expect(CLASS_DETAILS[slug], `missing entry for ${slug}`).toBeDefined();
    }
    expect(Object.keys(CLASS_DETAILS)).toHaveLength(9);
  });

  it("has positive integer icon file data IDs for every class", () => {
    for (const [slug, detail] of Object.entries(CLASS_DETAILS)) {
      expect(typeof detail.icon, `${slug}.icon should be a number`).toBe("number");
      expect(detail.icon, `${slug}.icon should be positive`).toBeGreaterThan(0);
    }
  });

  it("has valid resource types for every class", () => {
    const valid = new Set(["mana", "rage", "energy"]);
    for (const [slug, detail] of Object.entries(CLASS_DETAILS)) {
      expect(valid.has(detail.resource), `${slug}.resource "${detail.resource}" is not valid`).toBe(true);
    }
  });

  it("warrior uses rage, rogue uses energy, mage uses mana", () => {
    expect(CLASS_DETAILS["warrior"].resource).toBe("rage");
    expect(CLASS_DETAILS["rogue"].resource).toBe("energy");
    expect(CLASS_DETAILS["mage"].resource).toBe("mana");
  });

  it("all nine class icon IDs are distinct", () => {
    const icons = Object.values(CLASS_DETAILS).map((d) => d.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });
});

describe("racesForClass", () => {
  it("returns at least one race for every class", () => {
    for (const wowClass of WOW_CLASSES) {
      const races = racesForClass(wowClass.id, racesData.races);
      expect(races.length, `${wowClass.id} should have at least one race`).toBeGreaterThan(0);
    }
  });

  it("warrior has Human and Orc among its races", () => {
    const races = racesForClass("warrior", racesData.races);
    const slugs = races.map((r) => r.slug);
    expect(slugs).toContain("human");
    expect(slugs).toContain("orc");
  });

  it("druid has Night Elf and Tauren among its races", () => {
    const races = racesForClass("druid", racesData.races);
    const slugs = races.map((r) => r.slug);
    expect(slugs).toContain("night-elf");
    expect(slugs).toContain("tauren");
  });

  it("marks new-in-Forever combos as isNew", () => {
    // Human Hunter is new in Forever per the races data
    const races = racesForClass("hunter", racesData.races);
    const human = races.find((r) => r.slug === "human");
    expect(human, "human should be able to play hunter").toBeDefined();
    expect(human!.isNew).toBe(true);
  });

  it("preserves Alliance-then-Horde order from the races data", () => {
    const races = racesForClass("warrior", racesData.races);
    const factions = races.map((r) => {
      const original = racesData.races.find((rx) => rx.slug === r.slug);
      return original?.faction ?? "unknown";
    });
    // Alliance races come before Horde races
    const lastAlliance = factions.lastIndexOf("alliance");
    const firstHorde = factions.indexOf("horde");
    if (lastAlliance >= 0 && firstHorde >= 0) {
      expect(lastAlliance).toBeLessThan(firstHorde);
    }
  });
});

describe("findClass", () => {
  it("returns undefined for unknown class ids", () => {
    expect(findClass("unknown-class")).toBeUndefined();
    expect(findClass("")).toBeUndefined();
  });

  it("returns the right class for each id", () => {
    const ids: WowClassId[] = ["druid", "hunter", "mage", "paladin", "priest", "rogue", "shaman", "warlock", "warrior"];
    for (const id of ids) {
      const cls = findClass(id);
      expect(cls, `should find ${id}`).toBeDefined();
      expect(cls!.id).toBe(id);
    }
  });
});

describe("classChangesFor", () => {
  function makeEntry(classIds: WowClassId[], key = "k"): ChangeEntry {
    return {
      key,
      category: "talents",
      kind: "changed",
      name: "Test",
      summary: "",
      rows: [],
      classes: classIds,
      itemId: null,
      href: null,
      icon: null,
      provenance: { provenance: PROVENANCE.classic },
      since: null,
      searchText: "test",
    };
  }

  it("returns entries tagged for the given class", () => {
    const entries: ChangeEntry[] = [
      makeEntry(["warrior"], "w"),
      makeEntry(["mage"], "m"),
      makeEntry(["warrior", "paladin"], "wp"),
    ];
    const result = classChangesFor(entries, "warrior");
    expect(result.map((e) => e.key)).toEqual(["w", "wp"]);
  });

  it("returns empty when no entries are tagged for the class", () => {
    const entries: ChangeEntry[] = [makeEntry(["mage"], "m"), makeEntry(["druid"], "d")];
    expect(classChangesFor(entries, "warrior")).toHaveLength(0);
  });

  it("returns empty for an empty input", () => {
    expect(classChangesFor([], "warrior")).toHaveLength(0);
  });

  it("preserves the input order", () => {
    const entries: ChangeEntry[] = [
      makeEntry(["warrior"], "b"),
      makeEntry(["warrior"], "a"),
      makeEntry(["warrior"], "c"),
    ];
    const result = classChangesFor(entries, "warrior");
    expect(result.map((e) => e.key)).toEqual(["b", "a", "c"]);
  });
});
