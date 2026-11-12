import { describe, expect, it } from "vitest";
import { CHANGE_CATEGORIES } from "@/games/wow-forever/data/changes/changeCategories";
import { CHANGE_INDEX, CHANGE_SHARD_FILES } from "@/games/wow-forever/data/changes/changeFiles";
import { parseChangeFilters, writeChangeFilters } from "@/games/wow-forever/lib/changes/changeFilterParams";
import { changeLinkHref } from "@/games/wow-forever/lib/changes/changeLinkHref";
import { decodeChangeEntry } from "@/games/wow-forever/lib/changes/decodeChangeEntry";
import { filterChanges } from "@/games/wow-forever/lib/changes/filterChanges";
import { loadChangeCategory } from "@/games/wow-forever/lib/changes/loadChangeCategory";
import { findTalentPosition } from "@/games/wow-forever/lib/talents/findTalentPosition";
import type { ChangeFileEntry } from "@/games/wow-forever/types/changes/changeFileEntry";
import type { ChangeFilters } from "@/games/wow-forever/types/changes/changeFilters";
import type { Talent } from "@/games/wow-forever/types/talents/talent";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

const BUILD = "1.60.2.70900";

function fileEntry(overrides: Partial<ChangeFileEntry>): ChangeFileEntry {
  return { key: "x", kind: "changed", name: "Thing", summary: "Changed.", since: null, ...overrides };
}

const ENTRIES = [
  decodeChangeEntry("talents", fileEntry({ key: "talent:mage:1", name: "Arcane Focus (Arcane)", summary: "Hit raised from 2% to 3%.", classes: ["mage"], since: BUILD })),
  decodeChangeEntry("talents", fileEntry({ key: "talent:druid:2", name: "Feral Instinct (Feral Combat)", summary: "Threat raised.", classes: ["druid"] })),
  decodeChangeEntry("items", fileEntry({ key: "item:3", name: "Mage's Robe", summary: "Intellect added: 5.", classes: ["mage"] })),
  decodeChangeEntry("items", fileEntry({ key: "item:4", name: "Iron Sword", summary: "Item level raised from 20 to 22." })),
  decodeChangeEntry("quests", fileEntry({ key: "quest:5", kind: "new", name: "A New Hope", summary: "New quest, level 10." })),
];

function filters(patch: Partial<ChangeFilters>): ChangeFilters {
  return { category: "talents", classId: null, query: "", sinceLastBuild: false, ...patch };
}

const keys = (list: readonly { key: string }[]) => list.map((e) => e.key);

describe("filterChanges", () => {
  it("keeps only the picked category", () => {
    expect(keys(filterChanges(ENTRIES, filters({ category: "items" }), BUILD))).toEqual(["item:3", "item:4"]);
  });

  it("keeps only rows tagged with the picked class", () => {
    expect(keys(filterChanges(ENTRIES, filters({ classId: "mage" }), BUILD))).toEqual(["talent:mage:1"]);
    expect(keys(filterChanges(ENTRIES, filters({ category: "items", classId: "mage" }), BUILD))).toEqual(["item:3"]);
  });

  it("ignores the class in categories that have no classes", () => {
    expect(keys(filterChanges(ENTRIES, filters({ category: "quests", classId: "mage" }), BUILD))).toEqual(["quest:5"]);
  });

  it("needs every search word in the name or summary, any order, any case or accent", () => {
    expect(keys(filterChanges(ENTRIES, filters({ query: "FOCUS arcane" }), BUILD))).toEqual(["talent:mage:1"]);
    expect(keys(filterChanges(ENTRIES, filters({ query: "threat" }), BUILD))).toEqual(["talent:druid:2"]);
    expect(keys(filterChanges(ENTRIES, filters({ query: "arcane threat" }), BUILD))).toEqual([]);
  });

  it("an empty search keeps everything", () => {
    expect(filterChanges(ENTRIES, filters({ query: "   " }), BUILD)).toHaveLength(2);
  });

  it("since last build keeps rows first seen in this build", () => {
    expect(keys(filterChanges(ENTRIES, filters({ sinceLastBuild: true }), BUILD))).toEqual(["talent:mage:1"]);
  });
});

describe("change filter params", () => {
  it("a plain URL is the default category with no filters", () => {
    expect(parseChangeFilters(new URLSearchParams())).toEqual(filters({}));
  });

  it("reads every filter", () => {
    const params = new URLSearchParams("cat=items&class=mage&q=robe&since=1");
    expect(parseChangeFilters(params)).toEqual({ category: "items", classId: "mage", query: "robe", sinceLastBuild: true });
  });

  it("reads unknown values as defaults, never an error", () => {
    expect(parseChangeFilters(new URLSearchParams("cat=raids&class=deathknight&since=yes"))).toEqual(filters({}));
  });

  it("round-trips and leaves defaults and other params alone", () => {
    const written = writeChangeFilters(new URLSearchParams("keep=1&q=old"), filters({ category: "spells", classId: "priest" }));
    expect(written.toString()).toBe("keep=1&cat=spells&class=priest");
    expect(parseChangeFilters(written)).toEqual(filters({ category: "spells", classId: "priest" }));
    expect(writeChangeFilters(written, filters({})).toString()).toBe("keep=1");
  });
});

describe("decodeChangeEntry", () => {
  it("links each kind to our own page", () => {
    expect(changeLinkHref(["item", 647])).toBe("/wow-forever/items/647");
    expect(changeLinkHref(["talent", "druid", 762])).toBe("/wow-forever/talents/druid?talent=762");
    expect(changeLinkHref(["map", 1429])).toBe("/wow-forever/map?m=1429");
  });

  it("keeps an item's id for its tooltip link and drops unknown classes", () => {
    const entry = decodeChangeEntry("items", fileEntry({ link: ["item", 647], classes: ["mage", "monk"] }));
    expect(entry.itemId).toBe(647);
    expect(entry.classes).toEqual(["mage"]);
    expect(entry.rows).toEqual([]);
  });

  it("badges game-file rows as Game files and cache-named quests as Seen in game", () => {
    expect(decodeChangeEntry("items", fileEntry({})).provenance.provenance).toBe("client");
    const quest = decodeChangeEntry("quests", fileEntry({ provenance: "seen", seenOn: "2026-11-08" }));
    expect(quest.provenance.provenance).toBe("seen");
    expect(quest.provenance.date).toBeTruthy();
  });

  it("badges talent rows as Official: the live trees come from Blizzard's Game Data API", () => {
    const talent = decodeChangeEntry("talents", fileEntry({ provenance: "published" }));
    expect(talent.provenance.provenance).toBe("published");
    expect(talent.provenance.detail).toMatch(/Game Data API/);
  });
});

describe("change data", () => {
  it("every shard the index lists is a lazy chunk", () => {
    for (const category of CHANGE_CATEGORIES) {
      expect(CHANGE_INDEX.shards[category].length).toBeGreaterThan(0);
      for (const path of CHANGE_INDEX.shards[category]) expect(CHANGE_SHARD_FILES[`./${path}`], path).toBeDefined();
    }
  });

  it("loads each category with the counts the index states", async () => {
    for (const category of CHANGE_CATEGORIES) {
      const entries = await loadChangeCategory(category);
      const { changed, new: added } = CHANGE_INDEX.counts[category];
      expect(entries, category).toHaveLength(changed + added);
      expect(new Set(entries.map((e) => e.key)).size, `${category} keys are unique`).toBe(entries.length);
    }
  });
});

function talent(id: number): Talent {
  return {
    id,
    name: `T${id}`,
    tier: 0,
    column: 0,
    icon: 0,
    ranks: ["Rank 1"],
    prereqs: [],
    newInForever: false,
    classicRanks: null,
  };
}

describe("findTalentPosition", () => {
  const trees: TalentTree[] = [
    { id: 1, name: "A", icon: 0, talents: [talent(10), talent(11)] },
    { id: 2, name: "B", icon: 0, talents: [talent(20), talent(21)] },
  ];

  it("finds a talent's tree and index", () => {
    expect(findTalentPosition(trees, "21")).toEqual({ tree: 1, talent: 1 });
  });

  it("is null for a missing, malformed or other-class id", () => {
    expect(findTalentPosition(trees, null)).toBeNull();
    expect(findTalentPosition(trees, "1e1")).toBeNull();
    expect(findTalentPosition(trees, "99")).toBeNull();
  });
});
