import { describe, expect, it } from "vitest";
import tamableBeastsJson from "@/games/wow-forever/data/hunterPets/classic/tamableBeasts.json";
import hunterPetsJson from "@/games/wow-forever/data/hunterPets/hunterPets.json";
import { BEAST_SORT, DEFAULT_BEAST_SORT } from "@/games/wow-forever/data/hunterPets/hunterPetsConfig";
import { parseBeastFilters, writeBeastFilters } from "@/games/wow-forever/lib/hunterPets/beastFilterParams";
import { decodeHunterPets } from "@/games/wow-forever/lib/hunterPets/decodeHunterPets";
import { filterBeasts } from "@/games/wow-forever/lib/hunterPets/filterBeasts";
import {
  formatAttackSpeed,
  formatLevelRange,
  formatSignedPercent,
} from "@/games/wow-forever/lib/hunterPets/formatHunterPets";
import { teachersBySpell } from "@/games/wow-forever/lib/hunterPets/teachersBySpell";
import type { BeastFilters } from "@/games/wow-forever/types/hunterPets/beastFilters";
import type { HunterPetsData } from "@/games/wow-forever/types/hunterPets/hunterPetsData";
import type { HunterPetsDataFiles } from "@/games/wow-forever/types/hunterPets/hunterPetsDataFiles";

let committed: HunterPetsData | null = null;
/** The committed files decoded on first use, so a stale file fails its own tests rather than the whole suite. */
function getData(): HunterPetsData {
  committed ??= decodeHunterPets({ forever: hunterPetsJson, classic: tamableBeastsJson } as unknown as HunterPetsDataFiles);
  return committed;
}
const ALL: BeastFilters = { family: null, query: "", sort: DEFAULT_BEAST_SORT };

describe("decodeHunterPets", () => {
  it("keeps every family, ability and Classic beast in the files", () => {
    expect(getData().families).toHaveLength(hunterPetsJson.families.length);
    expect(getData().abilities).toHaveLength(hunterPetsJson.abilities.length);
    expect(getData().beasts.filter((b) => b.inClassic)).toHaveLength(tamableBeastsJson.beasts.length);
  });

  it("marks the beasts the client has met, including ones Classic lacks", () => {
    expect(getData().beasts.filter((b) => b.seenOn !== null)).toHaveLength(hunterPetsJson.seen.length);
    expect(getData().beasts.filter((b) => !b.inClassic).every((b) => b.seenOn !== null && b.minLevel === null)).toBe(true);
  });

  it("gives every seen row its own date", () => {
    for (const [id, , , seenOn] of hunterPetsJson.seen) {
      expect(getData().beasts.find((b) => b.id === id)?.seenOn).toBe(seenOn);
    }
  });

  it("numbers ranks from 1 and falls back to the ability's families", () => {
    for (const ability of getData().abilities) {
      ability.ranks.forEach((rank, i) => {
        expect(rank.rank).toBe(i + 1);
        expect(rank.familyIds.length).toBeGreaterThan(0);
      });
    }
  });

  it("resolves every spell a beast teaches to an ability rank", () => {
    const withTeaching = getData().beasts.filter((b) => b.teaches.length > 0);
    expect(withTeaching.length).toBeGreaterThan(0);
    const spells = new Set(getData().abilities.flatMap((a) => a.ranks.map((r) => r.spell)));
    for (const beast of withTeaching) for (const t of beast.teaches) expect(spells.has(t.spell)).toBe(true);
  });

  it("turns the attack speed into seconds", () => {
    const spider = getData().beasts.find((b) => b.id === 30);
    expect(spider?.name).toBe("Forest Spider");
    expect(spider?.attackSeconds).toBe(2);
    expect(spider?.zones).toEqual(["Elwynn Forest"]);
  });

  it("lists who teaches a rank", () => {
    const teachers = teachersBySpell(getData().beasts).get(17253);
    expect(teachers?.some((b) => b.name === "Forest Spider")).toBe(true);
  });
});

describe("decodeHunterPets seen dates", () => {
  const fixture: HunterPetsDataFiles = {
    forever: {
      families: [],
      abilities: [],
      seenColumns: ["id", "name", "family", "seenOn"],
      seen: [
        [1, "Wolf A", 1, "2026-11-01"],
        [2, "Wolf B", 1, "2026-11-12"],
        [3, "Forever Only", 1, "2026-11-05"],
      ],
    },
    classic: {
      zones: {},
      beasts: [
        [1, "Wolf A", 1, 1, 2, 2000, [], []],
        [2, "Wolf B", 1, 1, 2, 2000, [], []],
        [4, "Unmet Wolf", 1, 1, 2, 2000, [], []],
      ],
    },
  };
  const decoded = decodeHunterPets(fixture);
  const seenOn = (id: number) => decoded.beasts.find((b) => b.id === id)?.seenOn;

  it("decodes two beasts to their own dates", () => {
    expect(seenOn(1)).toBe("2026-11-01");
    expect(seenOn(2)).toBe("2026-11-12");
  });

  it("dates a beast only Forever has met, and leaves an unmet Classic beast null", () => {
    expect(seenOn(3)).toBe("2026-11-05");
    expect(seenOn(4)).toBeNull();
  });
});

describe("filterBeasts", () => {
  it("narrows to one family", () => {
    const spider = getData().families.find((f) => f.slug === "spider");
    const found = filterBeasts(getData().beasts, getData().families, { ...ALL, family: "spider" });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((b) => b.familyId === spider?.id)).toBe(true);
  });

  it("finds a beast by name, words in any order", () => {
    const found = filterBeasts(getData().beasts, getData().families, { ...ALL, query: "spider forest" });
    expect(found.some((b) => b.name === "Forest Spider")).toBe(true);
  });

  it("finds a beast by the ability it teaches", () => {
    const found = filterBeasts(getData().beasts, getData().families, { ...ALL, query: "bite" });
    expect(found.length).toBeGreaterThan(0);
  });

  it("returns nothing for gibberish", () => {
    expect(filterBeasts(getData().beasts, getData().families, { ...ALL, query: "zzzqqq" })).toEqual([]);
  });

  it("sorts by level with unknown levels last", () => {
    const sorted = filterBeasts(getData().beasts, getData().families, ALL);
    const levels = sorted.map((b) => b.minLevel);
    const firstNull = levels.indexOf(null);
    expect(firstNull === -1 || levels.slice(firstNull).every((l) => l === null)).toBe(true);
    const known = levels.filter((l): l is number => l !== null);
    expect(known).toEqual([...known].sort((a, b) => a - b));
  });

  it("sorts by attack speed, fastest first, and by zone A to Z", () => {
    const speeds = filterBeasts(getData().beasts, getData().families, { ...ALL, sort: BEAST_SORT.speed })
      .map((b) => b.attackSeconds)
      .filter((s): s is number => s !== null);
    expect(speeds).toEqual([...speeds].sort((a, b) => a - b));
    const zones = filterBeasts(getData().beasts, getData().families, { ...ALL, sort: BEAST_SORT.zone })
      .map((b) => b.zones[0])
      .filter((z): z is string => z !== undefined);
    expect(zones).toEqual([...zones].sort((a, b) => a.localeCompare(b)));
  });
});

describe("beast filter params", () => {
  it("round-trips and leaves defaults out", () => {
    const filters: BeastFilters = { family: "wolf", query: "dire", sort: BEAST_SORT.zone };
    expect(parseBeastFilters(writeBeastFilters(filters, new URLSearchParams()))).toEqual(filters);
    expect(writeBeastFilters(ALL, new URLSearchParams("keep=1")).toString()).toBe("keep=1");
  });

  it("ignores an unknown sort", () => {
    expect(parseBeastFilters(new URLSearchParams("sort=nope")).sort).toBe(DEFAULT_BEAST_SORT);
  });
});

describe("formatting", () => {
  it("formats levels, speed and percent", () => {
    expect(formatLevelRange({ minLevel: 5, maxLevel: 5 })).toBe("5");
    expect(formatLevelRange({ minLevel: 5, maxLevel: 7 })).toBe("5 to 7");
    expect(formatLevelRange({ minLevel: null, maxLevel: null })).toBe("");
    expect(formatAttackSpeed(2)).toBe("2.0 s");
    expect(formatAttackSpeed(null)).toBe("");
    expect(formatSignedPercent(5)).toBe("+5%");
    expect(formatSignedPercent(-10)).toBe("-10%");
    expect(formatSignedPercent(0)).toBe("0%");
  });
});
