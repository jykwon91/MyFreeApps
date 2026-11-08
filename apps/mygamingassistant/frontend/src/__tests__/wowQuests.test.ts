/**
 * WoW quest database — unit tests for:
 *   - decodeQuestIndex (decode from raw file format)
 *   - filterQuests (all filter combinations)
 *   - parseQuestQuery / questMatchesQuery (name search)
 *   - parseQuestFilter / writeQuestFilter (URL param round-trip)
 *   - questPageHref (canonical URL)
 */
import { describe, expect, it } from "vitest";

import { decodeQuestDetail } from "@/games/wow-forever/lib/quests/decodeQuestDetail";
import { decodeQuestIndex } from "@/games/wow-forever/lib/quests/decodeQuestIndex";
import { filterQuests } from "@/games/wow-forever/lib/quests/filterQuests";
import { listableQuests } from "@/games/wow-forever/lib/quests/listableQuests";
import { DEFAULT_QUEST_FILTER, parseQuestFilter, writeQuestFilter } from "@/games/wow-forever/lib/quests/questFilterParams";
import { questPageHref } from "@/games/wow-forever/lib/quests/questPageHref";
import { parseQuestQuery, questMatchesQuery } from "@/games/wow-forever/lib/quests/questSearch";
import type { QuestDetailFile } from "@/games/wow-forever/types/quests/questDetailFile";
import type { QuestFilter } from "@/games/wow-forever/types/quests/questFilter";
import type { QuestIndexEntry } from "@/games/wow-forever/types/quests/questIndexEntry";
import type { QuestIndexFile } from "@/games/wow-forever/types/quests/questIndexFile";
import type { QuestSeenFile } from "@/games/wow-forever/types/quests/questSeenFile";

// --- helpers ------------------------------------------------------------------

function entry(overrides: Partial<QuestIndexEntry> = {}): QuestIndexEntry {
  return {
    id: 100,
    name: "Red Silk Bandanas",
    level: 20,
    minLevel: 17,
    side: "A",
    zoneId: 40,
    isNew: false,
    searchWords: ["red", "silk", "bandanas"],
    ...overrides,
  };
}

function filter(overrides: Partial<QuestFilter> = {}): QuestFilter {
  return { ...DEFAULT_QUEST_FILTER, ...overrides };
}

const NO_SEEN = new Set<number>();

// --- questPageHref ------------------------------------------------------------

describe("questPageHref", () => {
  it("returns the canonical quest URL", () => {
    expect(questPageHref(166)).toBe("/wow-forever/quests/166");
    expect(questPageHref(1)).toBe("/wow-forever/quests/1");
  });
});

// --- parseQuestQuery / questMatchesQuery -------------------------------------

describe("questMatchesQuery", () => {
  it("matches when no query words (empty search)", () => {
    expect(questMatchesQuery(entry(), [])).toBe(true);
  });

  it("matches when every word appears as a prefix in search words", () => {
    const e = entry({ searchWords: ["red", "silk", "bandanas"] });
    expect(questMatchesQuery(e, ["red"])).toBe(true);
    expect(questMatchesQuery(e, ["red", "band"])).toBe(true);
    expect(questMatchesQuery(e, ["red", "silk", "bandanas"])).toBe(true);
  });

  it("does not match when any query word is absent", () => {
    const e = entry({ searchWords: ["red", "silk", "bandanas"] });
    expect(questMatchesQuery(e, ["green"])).toBe(false);
    expect(questMatchesQuery(e, ["red", "green"])).toBe(false);
  });

  it("matches are order-insensitive", () => {
    const e = entry({ searchWords: ["into", "keep"] });
    expect(questMatchesQuery(e, ["keep", "into"])).toBe(true);
  });

  it("returns false for unnamed quest (empty searchWords)", () => {
    const e = entry({ name: null, searchWords: [] });
    expect(questMatchesQuery(e, ["anything"])).toBe(false);
  });
});

describe("parseQuestQuery", () => {
  it("lowercases and splits into words", () => {
    expect(parseQuestQuery("Red Silk")).toEqual(["red", "silk"]);
  });

  it("lowercases and includes all words including articles", () => {
    // normalizeItemName does not strip stop words — "the" is kept
    const words = parseQuestQuery("The Defias Brotherhood");
    expect(words).toEqual(["the", "defias", "brotherhood"]);
  });

  it("returns empty array for empty string", () => {
    expect(parseQuestQuery("")).toEqual([]);
  });
});

// --- filterQuests -------------------------------------------------------------

describe("filterQuests", () => {
  const alliance = entry({ id: 1, side: "A", level: 22, zoneId: 40, isNew: false });
  const horde = entry({ id: 2, side: "H", level: 15, zoneId: 85, isNew: true, searchWords: ["red", "barrens", "quest"] });
  const neutral = entry({ id: 3, side: "N", level: 60, zoneId: null, isNew: false });
  const unnamed = entry({ id: 4, name: null, side: "N", level: 1, zoneId: null, isNew: false, searchWords: [] });
  const all = [alliance, horde, neutral, unnamed];

  it("returns all entries when no filters are active", () => {
    expect(filterQuests(all, filter(), NO_SEEN)).toHaveLength(4);
  });

  it("filters by name query (prefix, any word)", () => {
    const result = filterQuests(all, filter({ q: "red bar" }), NO_SEEN);
    expect(result.map((e) => e.id)).toEqual([2]);
  });

  it("filters by zone id", () => {
    const result = filterQuests(all, filter({ zoneId: 40 }), NO_SEEN);
    expect(result.map((e) => e.id)).toEqual([1]);
  });

  it("filters by faction — Alliance", () => {
    const result = filterQuests(all, filter({ side: "A" }), NO_SEEN);
    expect(result.map((e) => e.id)).toEqual([1]);
  });

  it("filters by faction — Horde", () => {
    const result = filterQuests(all, filter({ side: "H" }), NO_SEEN);
    expect(result.map((e) => e.id)).toEqual([2]);
  });

  it("filters by faction — Neutral", () => {
    const result = filterQuests(all, filter({ side: "N" }), NO_SEEN);
    expect(result.map((e) => e.id)).toEqual([3, 4]);
  });

  it("filters by min level (inclusive)", () => {
    const result = filterQuests(all, filter({ minLevel: 20 }), NO_SEEN);
    expect(result.map((e) => e.id)).toContain(1);
    expect(result.map((e) => e.id)).not.toContain(2);
  });

  it("filters by max level (inclusive)", () => {
    const result = filterQuests(all, filter({ maxLevel: 20 }), NO_SEEN);
    expect(result.map((e) => e.id)).not.toContain(3); // level 60
    expect(result.map((e) => e.id)).toContain(2);  // level 15
  });

  it("filters by level range", () => {
    const result = filterQuests(all, filter({ minLevel: 15, maxLevel: 22 }), NO_SEEN);
    expect(result.map((e) => e.id)).toEqual(expect.arrayContaining([1, 2]));
    expect(result.map((e) => e.id)).not.toContain(3); // 60 is out
  });

  it("isNew filter keeps only new-in-Forever quests", () => {
    const result = filterQuests(all, filter({ isNew: true }), NO_SEEN);
    expect(result.map((e) => e.id)).toEqual([2]);
  });

  it("seenInGame filter uses the seenIds set", () => {
    const seen = new Set([3]);
    const result = filterQuests(all, filter({ seenInGame: true }), seen);
    expect(result.map((e) => e.id)).toEqual([3]);
  });

  it("seenInGame filter returns empty when seenIds is empty", () => {
    expect(filterQuests(all, filter({ seenInGame: true }), NO_SEEN)).toHaveLength(0);
  });

  it("combines multiple filters (AND logic)", () => {
    const result = filterQuests(all, filter({ side: "N", minLevel: 50 }), NO_SEEN);
    expect(result.map((e) => e.id)).toEqual([3]);
  });

  it("unnamed quests are excluded by any name query", () => {
    const result = filterQuests(all, filter({ q: "quest" }), NO_SEEN);
    expect(result.map((e) => e.id)).not.toContain(4);
  });
});

// --- parseQuestFilter / writeQuestFilter --------------------------------------

describe("parseQuestFilter", () => {
  function parse(search: string): QuestFilter {
    return parseQuestFilter(new URLSearchParams(search));
  }

  it("returns defaults when params are empty", () => {
    expect(parse("")).toEqual(DEFAULT_QUEST_FILTER);
  });

  it("parses all params", () => {
    const result = parse("q=red+silk&zone=40&side=A&min=15&max=60&new=1&seen=1");
    expect(result.q).toBe("red silk");
    expect(result.zoneId).toBe(40);
    expect(result.side).toBe("A");
    expect(result.minLevel).toBe(15);
    expect(result.maxLevel).toBe(60);
    expect(result.isNew).toBe(true);
    expect(result.seenInGame).toBe(true);
  });

  it("sets zoneId to null for invalid zone param", () => {
    expect(parse("zone=abc").zoneId).toBeNull();
  });

  it("sets level to null for missing level params", () => {
    const result = parse("");
    expect(result.minLevel).toBeNull();
    expect(result.maxLevel).toBeNull();
  });
});

describe("writeQuestFilter", () => {
  it("omits default values", () => {
    const params = writeQuestFilter(DEFAULT_QUEST_FILTER);
    expect(params.toString()).toBe("");
  });

  it("writes all non-default values", () => {
    const f: QuestFilter = {
      q: "red",
      zoneId: 40,
      side: "A",
      minLevel: 15,
      maxLevel: 60,
      isNew: true,
      seenInGame: true,
    };
    const params = writeQuestFilter(f);
    expect(params.get("q")).toBe("red");
    expect(params.get("zone")).toBe("40");
    expect(params.get("side")).toBe("A");
    expect(params.get("min")).toBe("15");
    expect(params.get("max")).toBe("60");
    expect(params.get("new")).toBe("1");
    expect(params.get("seen")).toBe("1");
  });

  it("round-trips through parseQuestFilter", () => {
    const original: QuestFilter = { ...DEFAULT_QUEST_FILTER, q: "defias", side: "A", minLevel: 18 };
    const result = parseQuestFilter(writeQuestFilter(original));
    expect(result).toEqual(original);
  });
});

// --- decodeQuestIndex ---------------------------------------------------------

describe("decodeQuestIndex", () => {
  const COLUMNS = ["id", "name", "level", "minLevel", "side", "zoneId", "isNew"] as const;

  function makeFile(rows: (readonly unknown[])[]): QuestIndexFile {
    return {
      source: {},
      clientBuild: "1.2.3",
      columns: [...COLUMNS],
      quests: rows as unknown as QuestIndexFile["quests"],
      zones: [[40, "Westfall"]],
      counts: { total: rows.length, named: rows.length, withClassic: 1, seenInGame: 0, unnamed: 0 },
    };
  }

  it("decodes entries with correct types", () => {
    const file = makeFile([
      [166, "The Defias Brotherhood", 22, 17, "A", 40, false],
    ]);
    const index = decodeQuestIndex(file);
    expect(index.entries).toHaveLength(1);
    const e = index.entries[0];
    expect(e.id).toBe(166);
    expect(e.name).toBe("The Defias Brotherhood");
    expect(e.level).toBe(22);
    expect(e.minLevel).toBe(17);
    expect(e.side).toBe("A");
    expect(e.zoneId).toBe(40);
    expect(e.isNew).toBe(false);
  });

  it("sets searchWords from name, empty for null name", () => {
    const file = makeFile([
      [1, "Red Silk Bandanas", 20, 17, "N", null, false],
      [2, null, 1, 1, "N", null, false],
    ]);
    const index = decodeQuestIndex(file);
    expect(index.entries[0].searchWords.length).toBeGreaterThan(0);
    expect(index.entries[1].searchWords).toEqual([]);
  });

  it("coerces unknown side to neutral", () => {
    const file = makeFile([[5, "Q", 20, 17, "X", null, false]]);
    const index = decodeQuestIndex(file);
    expect(index.entries[0].side).toBe("N");
  });

  it("sets zoneId to null when column value is null", () => {
    const file = makeFile([[5, "Q", 20, 17, "N", null, false]]);
    const index = decodeQuestIndex(file);
    expect(index.entries[0].zoneId).toBeNull();
  });

  it("throws when a required column is missing", () => {
    const badFile: QuestIndexFile = {
      source: {},
      clientBuild: "1.0",
      columns: ["id", "name", "level"],
      quests: [],
      zones: [],
      counts: { total: 0, named: 0, withClassic: 0, seenInGame: 0, unnamed: 0 },
    };
    expect(() => decodeQuestIndex(badFile)).toThrow(/questIndex\.json/);
  });

  it("passes through clientBuild, zones and counts", () => {
    const file = makeFile([]);
    const index = decodeQuestIndex(file);
    expect(index.clientBuild).toBe("1.2.3");
    expect(index.zones).toEqual([[40, "Westfall"]]);
    expect(index.counts.total).toBe(0);
  });
});

// --- listableQuests -----------------------------------------------------------

describe("listableQuests", () => {
  it("leaves out quests with no name", () => {
    const named = entry({ id: 1 });
    const unnamed = entry({ id: 2, name: null, searchWords: [] });
    expect(listableQuests([named, unnamed]).map((e) => e.id)).toEqual([1]);
  });
});

// --- decodeQuestDetail --------------------------------------------------------

describe("decodeQuestDetail", () => {
  const shard: QuestDetailFile = {
    source: {},
    questColumns: ["id", "title", "level", "minLevel", "side", "classes", "givers", "chain", "objectives", "rewards", "choices", "enders"],
    giverColumns: ["kind", "id", "name", "zone", "subzone", "x", "y", "instance"],
    objectiveColumns: ["kind", "id", "count"],
    targetColumns: ["name", "instance"],
    quests: {},
    targets: {},
  };
  const seen: QuestSeenFile = {
    source: "questcache.wdb",
    clientBuild: 70862,
    seenOn: "2026-11-08",
    attribution: "",
    columns: ["title", "level", "minLevel", "objectives", "rewards", "choices"],
    quests: { "65602": ["A New Forever Quest", 12, 8, [], [[2589, 3]], []] },
  };
  const items = new Map([[2589, { name: "Linen Cloth", slot: "" }]]);

  it("builds a quest that's new in Forever from its seen row", () => {
    const quest = decodeQuestDetail(65602, shard, seen, new Map(), items);
    expect(quest).not.toBeNull();
    expect(quest?.title).toBe("A New Forever Quest");
    expect(quest?.level).toBe(12);
    expect(quest?.minLevel).toBe(8);
    expect(quest?.givers).toEqual([]);
    expect(quest?.rewards).toEqual([{ id: 2589, name: "Linen Cloth", count: 3 }]);
    expect(quest?.seenOn).toBe("2026-11-08");
  });

  it("returns null when neither the shard nor the seen file has the quest", () => {
    expect(decodeQuestDetail(1, shard, seen, new Map(), items)).toBeNull();
  });
});
