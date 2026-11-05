import itemsJsonText from "@/games/wow-forever/data/items/items.json?raw";
import { describe, expect, it } from "vitest";
import { decodeClientItems } from "@/games/wow-forever/lib/decodeClientItems";
import { describeClientItem, formatWeapon, topStatsLine } from "@/games/wow-forever/lib/describeClientItem";
import { isEditedFromGameFiles, resetToGameFiles } from "@/games/wow-forever/lib/itemNumbers";
import {
  ambiguousItemIds,
  exampleItemNames,
  normalizeItemName,
  searchItems,
  withinOneEdit,
} from "@/games/wow-forever/lib/itemSearch";
import { sameItemPositions } from "@/games/wow-forever/lib/sameItemPositions";
import { fromClientData } from "@/games/wow-forever/lib/toCompareItem";
import { newCompareItem } from "@/games/wow-forever/lib/newCompareItem";
import type { ClientItemFile } from "@/games/wow-forever/types/clientItemFile";
import type { ItemSearchFilters } from "@/games/wow-forever/types/itemSearchFilters";
import { FIXTURE_FILE, FIXTURE_SUFFIX_IDS, fixtureList } from "./wowClientItemsFixture";

const ANY: ItemSearchFilters = { slot: null, usableBy: null, bracket: "level60" };
const names = (query: string, filters: ItemSearchFilters = ANY) =>
  searchItems(fixtureList(), query, filters).items.map((i) => i.name);

describe("normalizeItemName", () => {
  it("lowercases, drops apostrophes and turns other punctuation into spaces", () => {
    expect(normalizeItemName("Crusader's  Helm")).toBe("crusaders helm");
    expect(normalizeItemName("Kris of Unspoken-Names!")).toBe("kris of unspoken names");
    expect(normalizeItemName("Café’s Blade")).toBe("cafes blade");
  });
});

describe("withinOneEdit", () => {
  it("accepts one insertion, deletion or substitution and nothing more", () => {
    expect(withinOneEdit("lionhart", "lionheart")).toBe(true);
    expect(withinOneEdit("lionheart", "lionhaart")).toBe(true);
    expect(withinOneEdit("lionheart", "lionhert")).toBe(true);
    expect(withinOneEdit("lionheart", "loinhaert")).toBe(false);
  });
});

describe("searchItems", () => {
  it("matches every word as a word start, in any order", () => {
    expect(names("helm lion")).toEqual(["Lionheart Helm"]);
    expect(names("dark pl")).toEqual(["Dark Iron Plate"]);
    expect(names("eart")).toEqual([]);
  });

  it("ignores apostrophes in what's typed and in names", () => {
    expect(names("crusaders")).toContain("Crusader's Helm");
    expect(names("crusader's")).toContain("Crusader's Helm");
  });

  it("ranks the exact name, then names starting with the query, then the rest", () => {
    // "Helm of the Crusader" has the higher item level, but names starting with the query come first.
    expect(names("crusader")).toEqual(["Crusader's Helm", "Crusader's Helm", "Crusader Helm", "Helm of the Crusader"]);
    expect(names("crusader helm")[0]).toBe("Crusader Helm");
  });

  it("breaks ties by bracket, then item level", () => {
    // Two "Crusader's Helm"s: one worn before 60 (9001), one at 60 (9008).
    const ids = (bracket: ItemSearchFilters["bracket"]) =>
      searchItems(fixtureList(), "crusaders helm", { ...ANY, bracket }).items.map((i) => i.id);
    expect(ids("level60")).toEqual([9008, 9001]);
    expect(ids("leveling")).toEqual([9001, 9008]);
    // Same rank and bracket: higher item level first.
    expect(names("plate")).toEqual(["Dark Iron Plate"]);
    expect(names("ring")).toEqual(["Ring of the Wanderer", "Twin Ring", "Twin Ring"]);
  });

  it("ignores number tokens that match nothing", () => {
    expect(names("lionheart 61")).toEqual(["Lionheart Helm"]);
    expect(names("61")).toEqual([]);
  });

  it("falls back to closest matches (one letter off, 5+ letters) only when nothing matches", () => {
    const result = searchItems(fixtureList(), "lionhart", ANY);
    expect(result.fuzzy).toBe(true);
    expect(result.items.map((i) => i.name)).toEqual(["Lionheart Helm"]);
    expect(searchItems(fixtureList(), "lion", ANY).fuzzy).toBe(false);
    expect(names("mase")).toEqual([]); // too short to be spelling-tolerant
  });

  it("filters by slot", () => {
    expect(names("helm", { ...ANY, slot: "chest" })).toEqual([]);
    expect(names("plate", { ...ANY, slot: "chest" })).toEqual(["Dark Iron Plate"]);
  });

  it("counts what it hides because the class can't use it", () => {
    const result = searchItems(fixtureList(), "benediction", { ...ANY, usableBy: "warrior" });
    expect(result.items).toEqual([]);
    expect(result.hiddenByClass).toBe(1);
    expect(result.fuzzy).toBe(false);
    expect(names("benediction", { ...ANY, usableBy: "priest" })).toEqual(["Benediction"]);
  });
});

describe("result rows", () => {
  it("describes slot, type, item level, requirement and the top two stats", () => {
    const list = fixtureList();
    expect(describeClientItem(list.byId.get(9007)!)).toBe("Chest, Cloth · ilvl 34 · req 29 · +8 Int +5 Spi");
    expect(topStatsLine(list.byId.get(12640)!)).toMatch(/^\+28 .+ \+20 /);
    expect(describeClientItem(list.byId.get(9006)!)).toContain("random suffix");
    expect(formatWeapon({ minDamage: 20, maxDamage: 38, speed: 2.6 })).toBe("20 - 38 damage, speed 2.6");
  });

  it("flags rows that would look identical", () => {
    expect([...ambiguousItemIds(searchItems(fixtureList(), "twin", ANY).items)].sort()).toEqual([9004, 9005]);
    expect(ambiguousItemIds(searchItems(fixtureList(), "helm", ANY).items).size).toBe(0);
  });

  it("uses real item names for the hint", () => {
    expect(exampleItemNames(fixtureList(), [12640, 11604])).toEqual(["Lionheart Helm", "Dark Iron Plate"]);
    expect(exampleItemNames(fixtureList(), [404])).toEqual(["Lionheart Helm", "Dark Iron Plate"]);
  });
});

describe("decodeClientItems", () => {
  it("refuses a file missing a column", () => {
    const broken: ClientItemFile = { ...FIXTURE_FILE, columns: FIXTURE_FILE.columns.filter((c) => c !== "armor") };
    expect(() => decodeClientItems(broken, [])).toThrow(/armor/);
  });

  it("marks random-suffix items and keeps class restrictions", () => {
    const list = decodeClientItems(FIXTURE_FILE, FIXTURE_SUFFIX_IDS);
    expect(list.byId.get(9006)?.randomSuffix).toBe(true);
    expect(list.byId.get(18608)?.classes).toEqual(["priest"]);
    expect(list.byId.get(2848)?.weapon).toEqual({ minDamage: 20, maxDamage: 38, speed: 2.6 });
  });

  it("decodes the committed generated file", () => {
    const file = JSON.parse(itemsJsonText) as ClientItemFile;
    const list = decodeClientItems(file, []);
    expect(list.items.length).toBeGreaterThan(4000);
    expect(list.byId.get(12640)?.stats).toEqual({ strength: 18, crit_rating: 28, hit_rating: 20 });
    expect(searchItems(list, "lionheart helm", ANY).items[0]?.id).toBe(12640);
  });
});

describe("picked items", () => {
  const list = fixtureList();

  it("fills the card from the game files and notes what they don't give", () => {
    const item = fromClientData("a", list.byId.get(18608)!, list.clientBuild);
    expect(item.source).toBe("database");
    expect(item.weapon).toBeNull();
    expect(item.warnings.join(" ")).toMatch(/don't give this weapon's damage/);
    expect(fromClientData("a", list.byId.get(9006)!, list.clientBuild).warnings).toContain(
      "Stats vary by suffix — enter the numbers from your tooltip.",
    );
    expect(fromClientData("a", list.byId.get(9005)!, list.clientBuild).warnings.join(" ")).toMatch(/1 other effect/);
  });

  it("knows when the player edited it, and resets to the game-file values", () => {
    const picked = fromClientData("a", list.byId.get(12640)!, list.clientBuild);
    expect(isEditedFromGameFiles(picked)).toBe(false);
    const edited = { ...picked, armor: 600, stats: { ...picked.stats, strength: 19 } };
    expect(isEditedFromGameFiles(edited)).toBe(true);
    const reset = resetToGameFiles(edited);
    expect(reset.armor).toBe(565);
    expect(reset.stats).toEqual(picked.stats);
    expect(isEditedFromGameFiles(reset)).toBe(false);
    expect(isEditedFromGameFiles(newCompareItem("x"))).toBe(false);
  });

  it("points a repeated item at the first card holding it", () => {
    const a = fromClientData("a", list.byId.get(12640)!, list.clientBuild);
    const b = fromClientData("b", list.byId.get(11604)!, list.clientBuild);
    const c = fromClientData("c", list.byId.get(12640)!, list.clientBuild);
    expect(sameItemPositions([a, b, newCompareItem("x"), c])).toEqual([null, null, null, 1]);
  });
});
