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
import type { HunterPetsDataFiles } from "@/games/wow-forever/types/hunterPets/hunterPetsDataFiles";

const data = decodeHunterPets({ forever: hunterPetsJson, classic: tamableBeastsJson } as unknown as HunterPetsDataFiles);
const ALL: BeastFilters = { family: null, query: "", sort: DEFAULT_BEAST_SORT };

describe("decodeHunterPets", () => {
  it("keeps every family, ability and Classic beast in the files", () => {
    expect(data.families).toHaveLength(hunterPetsJson.families.length);
    expect(data.abilities).toHaveLength(hunterPetsJson.abilities.length);
    expect(data.beasts.filter((b) => b.inClassic)).toHaveLength(tamableBeastsJson.beasts.length);
  });

  it("marks the beasts the client has met, including ones Classic lacks", () => {
    expect(data.beasts.filter((b) => b.seenInGame)).toHaveLength(hunterPetsJson.seen.length);
    expect(data.beasts.filter((b) => !b.inClassic).every((b) => b.seenInGame && b.minLevel === null)).toBe(true);
  });

  it("numbers ranks from 1 and falls back to the ability's families", () => {
    for (const ability of data.abilities) {
      ability.ranks.forEach((rank, i) => {
        expect(rank.rank).toBe(i + 1);
        expect(rank.familyIds.length).toBeGreaterThan(0);
      });
    }
  });

  it("resolves every spell a beast teaches to an ability rank", () => {
    const withTeaching = data.beasts.filter((b) => b.teaches.length > 0);
    expect(withTeaching.length).toBeGreaterThan(0);
    const spells = new Set(data.abilities.flatMap((a) => a.ranks.map((r) => r.spell)));
    for (const beast of withTeaching) for (const t of beast.teaches) expect(spells.has(t.spell)).toBe(true);
  });

  it("turns the attack speed into seconds", () => {
    const spider = data.beasts.find((b) => b.id === 30);
    expect(spider?.name).toBe("Forest Spider");
    expect(spider?.attackSeconds).toBe(2);
    expect(spider?.zones).toEqual(["Elwynn Forest"]);
  });

  it("lists who teaches a rank", () => {
    const teachers = teachersBySpell(data.beasts).get(17253);
    expect(teachers?.some((b) => b.name === "Forest Spider")).toBe(true);
  });
});

describe("filterBeasts", () => {
  it("narrows to one family", () => {
    const spider = data.families.find((f) => f.slug === "spider");
    const found = filterBeasts(data.beasts, data.families, { ...ALL, family: "spider" });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((b) => b.familyId === spider?.id)).toBe(true);
  });

  it("finds a beast by name, words in any order", () => {
    const found = filterBeasts(data.beasts, data.families, { ...ALL, query: "spider forest" });
    expect(found.some((b) => b.name === "Forest Spider")).toBe(true);
  });

  it("finds a beast by the ability it teaches", () => {
    const found = filterBeasts(data.beasts, data.families, { ...ALL, query: "bite" });
    expect(found.length).toBeGreaterThan(0);
  });

  it("returns nothing for gibberish", () => {
    expect(filterBeasts(data.beasts, data.families, { ...ALL, query: "zzzqqq" })).toEqual([]);
  });

  it("sorts by level with unknown levels last", () => {
    const sorted = filterBeasts(data.beasts, data.families, ALL);
    const levels = sorted.map((b) => b.minLevel);
    const firstNull = levels.indexOf(null);
    expect(firstNull === -1 || levels.slice(firstNull).every((l) => l === null)).toBe(true);
    const known = levels.filter((l): l is number => l !== null);
    expect(known).toEqual([...known].sort((a, b) => a - b));
  });

  it("sorts by attack speed, fastest first, and by zone A to Z", () => {
    const speeds = filterBeasts(data.beasts, data.families, { ...ALL, sort: BEAST_SORT.speed })
      .map((b) => b.attackSeconds)
      .filter((s): s is number => s !== null);
    expect(speeds).toEqual([...speeds].sort((a, b) => a - b));
    const zones = filterBeasts(data.beasts, data.families, { ...ALL, sort: BEAST_SORT.zone })
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
