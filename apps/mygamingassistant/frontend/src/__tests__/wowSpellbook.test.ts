import { describe, expect, it } from "vitest";
import { WOW_CLASSES, type WowClassId } from "@/games/wow-forever/data/classes";
import warlockClassic from "@/games/wow-forever/data/spellbook/classic/warlock.json";
import warlockFile from "@/games/wow-forever/data/spellbook/warlock.json";
import { CLASSIC_SPELLBOOK_FILES, FOREVER_SPELLBOOK_FILES } from "@/games/wow-forever/data/spellbook/spellbookFiles";
import { decodeSpellbook } from "@/games/wow-forever/lib/spellbook/decodeSpellbook";
import { filterSpells } from "@/games/wow-forever/lib/spellbook/filterSpells";
import {
  DEFAULT_SPELLBOOK_FILTERS,
  isDefaultSpellbookFilters,
  parseSpellbookFilters,
  writeSpellbookFilters,
} from "@/games/wow-forever/lib/spellbook/spellbookFilterParams";
import { changesHref, downrankHref, spellAnchorId, talentHref } from "@/games/wow-forever/lib/spellbook/spellbookLinks";
import type { SpellbookClassicFile } from "@/games/wow-forever/types/spellbook/spellbookClassicFile";
import type { SpellbookFile } from "@/games/wow-forever/types/spellbook/spellbookFile";
import type { SpellbookFilters } from "@/games/wow-forever/types/spellbook/spellbookFilters";
import type { SpellbookSpell } from "@/games/wow-forever/types/spellbook/spellbookSpell";

const WARLOCK = decodeSpellbook(warlockFile as SpellbookFile, warlockClassic as SpellbookClassicFile);

function spell(name: string): SpellbookSpell {
  const found = WARLOCK.spells.find((s) => s.name === name);
  if (!found) throw new Error(`no ${name}`);
  return found;
}

function filters(patch: Partial<SpellbookFilters> = {}): SpellbookFilters {
  return { ...DEFAULT_SPELLBOOK_FILTERS, ...patch };
}

function fileFor(glob: Record<string, unknown>, classId: WowClassId, classic: boolean): string | undefined {
  return Object.keys(glob).find((p) => p.endsWith(`${classic ? "classic/" : ""}${classId}.json`) && p.includes("/classic/") === classic);
}

describe("spellbook files — one per class, Forever and Classic", () => {
  it("every class has a Forever file and a Classic file", () => {
    for (const c of WOW_CLASSES) {
      expect(fileFor(FOREVER_SPELLBOOK_FILES, c.id, false), c.id).toBeDefined();
      expect(fileFor(CLASSIC_SPELLBOOK_FILES, c.id, true), c.id).toBeDefined();
    }
  });

  it("every class decodes: tabs, unique spell ids, ranks, and every spell under a known tab", async () => {
    for (const c of WOW_CLASSES) {
      const forever = (await FOREVER_SPELLBOOK_FILES[fileFor(FOREVER_SPELLBOOK_FILES, c.id, false)!]()) as SpellbookFile;
      const classic = (await CLASSIC_SPELLBOOK_FILES[fileFor(CLASSIC_SPELLBOOK_FILES, c.id, true)!]()) as SpellbookClassicFile;
      const book = decodeSpellbook(forever, classic);
      expect(book.classId).toBe(c.id);
      expect(book.tabs).toHaveLength(3);
      expect(book.spells.length).toBeGreaterThan(30);
      const tabIds = new Set(book.tabs.map((t) => t.id));
      expect(new Set(book.spells.map((s) => s.id)).size).toBe(book.spells.length);
      for (const s of book.spells) {
        expect(tabIds.has(s.tab), s.name).toBe(true);
        expect(s.ranks.length, s.name).toBeGreaterThan(0);
        // A talent's spell level isn't when you can take it, so no talent rank carries one.
        for (const r of s.ranks) if (r.learnedBy === "talent") expect(r.level, s.name).toBeNull();
      }
    }
  });
});

describe("decodeSpellbook — Forever first, Classic merged by spell id", () => {
  it("Shadow Bolt: Forever text, a Classic trainer cost, a downrank family and the different mark", () => {
    const bolt = spell("Shadow Bolt");
    expect(bolt.downrank).toBe("warlock-shadow-bolt");
    expect(bolt.change).toBe("changed");
    expect(bolt.firstLevel).toBe(1);
    const first = bolt.ranks[0];
    expect(first.text).toBe("Sends a shadowy bolt at the enemy, causing 11 to 15 Shadow damage.");
    expect(first.textClassic).toBe(false);
    // Rank 1 is known from the start: no trainer teaches it.
    expect(first.learnedBy).toBeNull();
    const corruption = spell("Corruption").ranks[0];
    expect(corruption).toMatchObject({ spell: 172, learnedBy: "trainer", cost: 100 });
  });

  it("a talent spell links its talent, is learned by a talent point and never has a cost", () => {
    const burn = spell("Shadowburn");
    expect(burn.talent).toBe(135415);
    expect(burn.ranks[0].learnedBy).toBe("talent");
    expect(burn.ranks[0].cost).toBeNull();
    // Its later ranks come from a trainer, so the spell's first level is theirs.
    const trained = burn.ranks.filter((r) => r.learnedBy !== "talent").map((r) => r.level ?? Infinity);
    expect(burn.firstLevel).toBe(Math.min(...trained));
  });

  it("a cost comes from the Classic file by spell id; a rank it lacks has none", () => {
    const file: SpellbookFile = {
      source: "x",
      clientBuild: "1",
      classId: "warlock",
      tabs: [{ id: 1, name: "A" }],
      spells: [
        { id: 10, name: "Bolt", tab: 1, icon: 0, ranks: [{ spell: 10, rank: "Rank 1", level: 4 }, { spell: 11, rank: "Rank 2" }] },
        { id: 20, name: "Tome", tab: 1, icon: 0, ranks: [{ spell: 20, level: 30 }] },
      ],
    };
    const classic: SpellbookClassicFile = {
      source: "y",
      classId: "warlock",
      costs: { "10": 100 },
      quests: [],
      books: [20],
      texts: { "11": "Old text." },
      levels: { "11": 12 },
    };
    const [bolt, tome] = decodeSpellbook(file, classic).spells;
    expect(bolt.ranks[0]).toMatchObject({ cost: 100, learnedBy: "trainer", level: 4, levelClassic: false, text: null });
    expect(bolt.ranks[1]).toMatchObject({ cost: null, learnedBy: null, level: 12, levelClassic: true, text: "Old text.", textClassic: true });
    expect(bolt.firstLevel).toBe(4);
    expect(tome.ranks[0]).toMatchObject({ learnedBy: "book", cost: null });
  });
});

describe("filterSpells — tabs, different only, search, level, and the chip counts", () => {
  const all = WARLOCK.spells;
  const destruction = 593;

  it("no filters keeps everything; tab counts add up to the total", () => {
    const r = filterSpells(all, filters());
    expect(r.spells).toHaveLength(all.length);
    expect(r.allTabsCount).toBe(all.length);
    expect([...r.tabCounts.values()].reduce((a, b) => a + b, 0)).toBe(all.length);
    expect(r.differentCount).toBe(all.filter((s) => s.change !== null).length);
  });

  it("a tab keeps only that tab; its chip count matches", () => {
    const r = filterSpells(all, filters({ tab: destruction }));
    expect(r.spells.every((s) => s.tab === destruction)).toBe(true);
    expect(r.spells).toHaveLength(r.tabCounts.get(destruction)!);
    expect(r.differentCount).toBe(r.spells.filter((s) => s.change !== null).length);
  });

  it("different only keeps changed and new spells, and the tab chips count with it on", () => {
    const r = filterSpells(all, filters({ differentOnly: true }));
    expect(r.spells.length).toBeGreaterThan(0);
    expect(r.spells.every((s) => s.change !== null)).toBe(true);
    expect(r.allTabsCount).toBe(r.spells.length);
    expect(r.spells.some((s) => s.name === "Bane of Agony")).toBe(true);
  });

  it("search matches every word in the name or tooltip, any order", () => {
    expect(filterSpells(all, filters({ query: "bolt shadow" })).spells.map((s) => s.name)).toContain("Shadow Bolt");
    expect(filterSpells(all, filters({ query: "shadowy bolt" })).spells.map((s) => s.name)).toContain("Shadow Bolt");
    expect(filterSpells(all, filters({ query: "zzzz" })).spells).toHaveLength(0);
  });

  it("a level keeps spells with a rank learnable by then; spells with no level drop out", () => {
    const r = filterSpells(all, filters({ level: 1 }));
    expect(r.spells.every((s) => s.firstLevel !== null && s.firstLevel <= 1)).toBe(true);
    expect(r.spells.map((s) => s.name)).toContain("Shadow Bolt");
    expect(r.spells.map((s) => s.name)).not.toContain("Soul Link");
  });
});

describe("spellbook URL filters", () => {
  it("round-trips every filter and leaves the plain page's URL plain", () => {
    const f = filters({ tab: 593, differentOnly: true, query: "bolt", level: 20 });
    const written = writeSpellbookFilters(new URLSearchParams(), f);
    expect(written.toString()).toBe("tab=593&diff=1&q=bolt&lvl=20");
    expect(parseSpellbookFilters(written)).toEqual(f);
    expect(writeSpellbookFilters(written, DEFAULT_SPELLBOOK_FILTERS).toString()).toBe("");
    expect(isDefaultSpellbookFilters(parseSpellbookFilters(new URLSearchParams()))).toBe(true);
  });

  it("malformed values read as no filter", () => {
    const f = parseSpellbookFilters(new URLSearchParams("tab=abc&diff=yes&lvl=99"));
    expect(f).toEqual(DEFAULT_SPELLBOOK_FILTERS);
  });
});

describe("spellbook links", () => {
  it("builds the anchor, talent, downrank and changes links", () => {
    expect(spellAnchorId(686)).toBe("spell-686");
    expect(talentHref("warlock", 963)).toBe("/wow-forever/talents/warlock?talent=963");
    expect(downrankHref("warlock-shadow-bolt")).toBe("/wow-forever/downrank?spell=warlock-shadow-bolt");
    expect(changesHref("warlock", "Shadow Bolt")).toBe("/wow-forever/changes?cat=spells&class=warlock&q=Shadow+Bolt");
  });
});
