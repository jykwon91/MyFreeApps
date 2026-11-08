import { describe, expect, it } from "vitest";
import libraryJson from "@/games/wow-forever/data/library/library.json";
import { decodeLibrary } from "@/games/wow-forever/lib/library/decodeLibrary";
import { filterBooks, itemLevelCounts } from "@/games/wow-forever/lib/library/filterBooks";
import {
  DEFAULT_LIBRARY_FILTERS,
  isDefaultLibraryFilters,
  parseLibraryFilters,
  writeLibraryFilters,
} from "@/games/wow-forever/lib/library/libraryFilterParams";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { LibraryDataFile } from "@/games/wow-forever/types/library/libraryDataFile";

const data = decodeLibrary(libraryJson as unknown as LibraryDataFile);
const none = new Set<string>();

describe("library data", () => {
  it("decodes the 40 books, both library cards and Friend of the Library", () => {
    expect(data.books).toHaveLength(40);
    expect(data.books.every((b) => b.description.endsWith("addition to any library's collection."))).toBe(true);
    expect(data.cards.map((c) => c.city)).toEqual(["Stormwind", "Undercity"]);
    const friend = data.quests.find((q) => q.id === 78150);
    expect(friend?.title).toBe("Friend of the Library");
    expect(friend?.choices.map((i) => i.name).sort()).toEqual(["Erudite's Amulet", "Scholarly Pendant"]);
    expect(friend?.choices.every((i) => i.slot === "neck" && i.quality === "uncommon")).toBe(true);
  });

  it("has an icon for every book, card and reward", () => {
    const ids = [...data.books, ...data.cards].map((x) => x.id).concat(data.quests.flatMap((q) => q.choices.map((i) => i.id)));
    expect(ids.filter((id) => !itemIcon(id))).toEqual([]);
  });

  it("throws on a file missing a column", () => {
    const broken = { ...(libraryJson as unknown as LibraryDataFile), bookColumns: ["id"] };
    expect(() => decodeLibrary(broken)).toThrow(/name/);
  });
});

describe("filterBooks", () => {
  it("matches every search word in the name or description, any order", () => {
    const byName = filterBooks(data.books, { ...DEFAULT_LIBRARY_FILTERS, query: "antonidas archmage" }, none);
    expect(byName.map((b) => b.id)).toEqual([203754]);
    const byDescription = filterBooks(data.books, { ...DEFAULT_LIBRARY_FILTERS, query: "goblin mage" }, none);
    expect(byDescription.map((b) => b.id)).toContain(208800);
  });

  it("keeps one item level and hides found books", () => {
    const tens = filterBooks(data.books, { ...DEFAULT_LIBRARY_FILTERS, itemLevel: 10 }, none);
    expect(tens.length).toBeGreaterThan(0);
    expect(tens.every((b) => b.itemLevel === 10)).toBe(true);
    const found = new Set([String(tens[0].id)]);
    const hidden = filterBooks(data.books, { ...DEFAULT_LIBRARY_FILTERS, itemLevel: 10, hideFound: true }, found);
    expect(hidden).toHaveLength(tens.length - 1);
  });

  it("counts each item level with the other filters on, but not its own", () => {
    const counts = itemLevelCounts(data.books, { ...DEFAULT_LIBRARY_FILTERS, itemLevel: 60 }, none);
    expect(counts.map((c) => c.itemLevel)).toEqual([10, 25, 50, 60]);
    expect(counts.reduce((sum, c) => sum + c.count, 0)).toBe(40);
  });
});

describe("library filter params", () => {
  it("round-trips through the URL and leaves defaults out", () => {
    const filters = { query: "gnome", itemLevel: 25, hideFound: true };
    const params = writeLibraryFilters(new URLSearchParams("keep=1"), filters);
    expect(params.toString()).toBe("keep=1&q=gnome&ilvl=25&hide=1");
    expect(parseLibraryFilters(params)).toEqual(filters);
    expect(writeLibraryFilters(params, DEFAULT_LIBRARY_FILTERS).toString()).toBe("keep=1");
  });

  it("reads malformed values as no filter", () => {
    expect(parseLibraryFilters(new URLSearchParams("ilvl=abc&hide=yes"))).toEqual(DEFAULT_LIBRARY_FILTERS);
    expect(isDefaultLibraryFilters({ ...DEFAULT_LIBRARY_FILTERS, query: "  " })).toBe(true);
  });
});
