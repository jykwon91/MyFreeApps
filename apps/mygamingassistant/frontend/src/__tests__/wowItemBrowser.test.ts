import { describe, expect, it } from "vitest";
import itemIndexJson from "@/games/wow-forever/data/items/itemIndex.json";
import itemsJson from "@/games/wow-forever/data/items/items.json";
import { ITEM_BROWSER_PARAM } from "@/games/wow-forever/data/itemBrowser/itemBrowserConfig";
import { decodeItemIndex, orderItemTypes } from "@/games/wow-forever/lib/itemBrowser/decodeItemIndex";
import { filterItems } from "@/games/wow-forever/lib/itemBrowser/filterItems";
import {
  activeFilterCount,
  clampInt,
  DEFAULT_ITEM_FILTERS,
  parseItemBrowserQuery,
  toBoundedInt,
  writeItemBrowserQuery,
} from "@/games/wow-forever/lib/itemBrowser/itemBrowserParams";
import { itemClassGroup } from "@/games/wow-forever/lib/itemBrowser/itemClassGroup";
import { itemLevelText, itemSlotText } from "@/games/wow-forever/lib/itemBrowser/itemMetaText";
import { sortItems } from "@/games/wow-forever/lib/itemBrowser/sortItems";
import { nameWords, normalizeItemName } from "@/games/wow-forever/lib/itemSearch";
import type { ItemBrowserFilters } from "@/games/wow-forever/types/itemBrowser/itemBrowserFilters";
import { ITEM_CHANGE } from "@/games/wow-forever/types/itemBrowser/itemChangeKind";
import { ITEM_CLASS_GROUP } from "@/games/wow-forever/types/itemBrowser/itemClassGroup";
import type { ItemIndexEntry } from "@/games/wow-forever/types/itemBrowser/itemIndexEntry";
import type { ItemIndexFile } from "@/games/wow-forever/types/itemBrowser/itemIndexFile";
import { SORT_DIRECTION } from "@/games/wow-forever/types/itemBrowser/itemSortDirection";
import { ITEM_SORT } from "@/games/wow-forever/types/itemBrowser/itemSortKey";

const file = itemIndexJson as unknown as ItemIndexFile;
const index = decodeItemIndex(file);

function entry(overrides: Partial<ItemIndexEntry>): ItemIndexEntry {
  const name = overrides.name ?? "Test Item";
  return {
    id: 1,
    name,
    quality: "rare",
    slot: "head",
    itemType: "Plate",
    itemLevel: 50,
    requiredLevel: 45,
    change: ITEM_CHANGE.none,
    group: ITEM_CLASS_GROUP.armor,
    searchWords: nameWords(normalizeItemName(name)),
    ...overrides,
  };
}

function filters(overrides: Partial<ItemBrowserFilters>): ItemBrowserFilters {
  return { ...DEFAULT_ITEM_FILTERS, ...overrides };
}

const ITEMS: readonly ItemIndexEntry[] = [
  entry({ id: 1, name: "Lionheart Helm", quality: "epic", itemLevel: 61, requiredLevel: 56 }),
  entry({ id: 2, name: "Helm of Valor", quality: "rare", itemLevel: 57, requiredLevel: 52, change: ITEM_CHANGE.changed }),
  entry({ id: 3, name: "Cape of the Black Baron", slot: "back", itemType: "Cloth", group: ITEM_CLASS_GROUP.cloak, itemLevel: 63, requiredLevel: 58 }),
  entry({ id: 4, name: "Hand of Justice", slot: "trinket", itemType: null, group: ITEM_CLASS_GROUP.jewelry, itemLevel: 58, requiredLevel: 53 }),
  entry({ id: 5, name: "Arcanite Reaper", quality: "epic", slot: "two_hand", itemType: "Axe", group: ITEM_CLASS_GROUP.weapon, itemLevel: 63, requiredLevel: 58, change: ITEM_CHANGE.new }),
  entry({ id: 6, name: "Elementium Reinforced Bulwark", slot: "off_hand", itemType: "Shield", group: ITEM_CLASS_GROUP.offHand, itemLevel: 55, requiredLevel: 0 }),
];

describe("the committed item index", () => {
  it("has the columns the decoder reads and decodes every row", () => {
    expect(file.columns).toEqual(["id", "name", "quality", "slot", "itemType", "itemLevel", "requiredLevel", "change"]);
    expect(file.changeKinds).toEqual(["none", "changed", "new"]);
    expect(index.items).toHaveLength(file.items.length);
    expect(index.items.length).toBeGreaterThan(5000);
  });

  it("holds exactly the items in items.json, so nothing is filled from Classic", () => {
    const listed = new Set((itemsJson as unknown as { items: readonly (readonly unknown[])[] }).items.map((row) => Number(row[0])));
    const indexed = new Set(index.items.map((i) => i.id));
    expect(indexed.size).toBe(index.items.length);
    expect([...indexed].every((id) => listed.has(id))).toBe(true);
    expect(indexed.size).toBe(listed.size);
  });

  it("decodes real items with their slot, type, levels and group", () => {
    const helm = index.items.find((i) => i.name === "Lionheart Helm");
    expect(helm).toMatchObject({ quality: "epic", slot: "head", itemType: "Plate", group: ITEM_CLASS_GROUP.armor });
    const hoj = index.items.find((i) => i.name === "Hand of Justice");
    expect(hoj).toMatchObject({ slot: "trinket", itemType: null, group: ITEM_CLASS_GROUP.jewelry });
  });

  it("has items of each change kind and chip options in game order", () => {
    expect(index.items.some((i) => i.change === ITEM_CHANGE.changed)).toBe(true);
    expect(index.items.some((i) => i.change === ITEM_CHANGE.new)).toBe(true);
    expect(index.qualities).toEqual(["uncommon", "rare", "epic", "legendary"]);
    expect(index.slots[0]).toBe("head");
    expect(index.itemTypes.slice(0, 5)).toEqual(["Cloth", "Leather", "Mail", "Plate", "Shield"]);
  });
});

describe("decoding helpers", () => {
  it("orders armor types first, then the rest A–Z", () => {
    expect(orderItemTypes(["Sword", "Plate", "Axe", "Cloth"])).toEqual(["Cloth", "Plate", "Axe", "Sword"]);
  });

  it("groups by slot, a shield with shields and off-hands, a cloak never as armor", () => {
    expect(itemClassGroup("back", "Cloth")).toBe(ITEM_CLASS_GROUP.cloak);
    expect(itemClassGroup("off_hand", "Shield")).toBe(ITEM_CLASS_GROUP.offHand);
    expect(itemClassGroup("off_hand", "Dagger")).toBe(ITEM_CLASS_GROUP.weapon);
    expect(itemClassGroup("held_in_off_hand", null)).toBe(ITEM_CLASS_GROUP.offHand);
  });

  it("drops a row whose codes it doesn't know", () => {
    const bad = { ...file, items: [[1, "Odd", 99, 0, -1, 10, 1, 0], file.items[0]] };
    expect(decodeItemIndex(bad).items).toHaveLength(1);
  });

  it("writes the row's meta line", () => {
    expect(itemSlotText(ITEMS[0])).toBe("Head, Plate");
    expect(itemSlotText(ITEMS[3])).toBe("Trinket");
    expect(itemLevelText(ITEMS[5])).toBe("Item level 55");
    expect(itemLevelText(ITEMS[0])).toBe("Item level 61 · Requires level 56");
  });
});

describe("filterItems", () => {
  const ids = (f: Partial<ItemBrowserFilters>) => filterItems(ITEMS, filters(f)).items.map((i) => i.id);

  it("keeps everything with no filters", () => {
    expect(ids({})).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("searches every word in any order", () => {
    expect(ids({ query: "helm" })).toEqual([1, 2]);
    expect(ids({ query: "baron cape" })).toEqual([3]);
  });

  it("falls back to one-letter-off matches only when nothing matches", () => {
    const result = filterItems(ITEMS, filters({ query: "lionhart" }));
    expect(result.fuzzy).toBe(true);
    expect(result.items.map((i) => i.id)).toEqual([1]);
    expect(filterItems(ITEMS, filters({ query: "helm" })).fuzzy).toBe(false);
  });

  it("shows nothing (not near misses) when chips hide every exact name match", () => {
    const result = filterItems(ITEMS, filters({ query: "lionheart", qualities: ["common"] }));
    expect(result.fuzzy).toBe(false);
    expect(result.items).toEqual([]);
  });

  it("ORs within a group and ANDs across groups", () => {
    expect(ids({ qualities: ["epic"] })).toEqual([1, 5]);
    expect(ids({ qualities: ["epic"], groups: [ITEM_CLASS_GROUP.armor] })).toEqual([1]);
    expect(ids({ slots: ["back", "trinket"] })).toEqual([3, 4]);
    expect(ids({ types: ["Shield"] })).toEqual([6]);
  });

  it("filters by Forever change", () => {
    expect(ids({ changes: [ITEM_CHANGE.changed] })).toEqual([2]);
    expect(ids({ changes: [ITEM_CHANGE.changed, ITEM_CHANGE.new] })).toEqual([2, 5]);
  });

  it("filters by required and item level, bounds included", () => {
    expect(ids({ requiredMin: 56 })).toEqual([1, 3, 5]);
    expect(ids({ requiredMax: 52 })).toEqual([2, 6]);
    expect(ids({ itemLevelMin: 58, itemLevelMax: 61 })).toEqual([1, 4]);
  });

  it("counts each chip with every other group applied but not its own", () => {
    const { counts } = filterItems(ITEMS, filters({ qualities: ["epic"], groups: [ITEM_CLASS_GROUP.armor] }));
    // Quality counts ignore the quality filter: armor items are 2 (rare + epic).
    expect(counts.quality.get("epic")).toBe(1);
    expect(counts.quality.get("rare")).toBe(1);
    // Group counts ignore the group filter: epic items are 1 armor + 1 weapon.
    expect(counts.group.get(ITEM_CLASS_GROUP.armor)).toBe(1);
    expect(counts.group.get(ITEM_CLASS_GROUP.weapon)).toBe(1);
    expect(counts.group.get(ITEM_CLASS_GROUP.cloak)).toBeUndefined();
    // Other groups see both filters.
    expect(counts.slot.get("head")).toBe(1);
    expect(counts.change.get(ITEM_CHANGE.new)).toBeUndefined();
  });

  it("finds a real item in the committed index", () => {
    const found = filterItems(index.items, filters({ query: "lionheart helm" })).items;
    expect(found.map((i) => i.name)).toContain("Lionheart Helm");
  });
});

describe("sortItems", () => {
  it("sorts by item level, highest first by default", () => {
    expect(sortItems(ITEMS, ITEM_SORT.itemLevel, SORT_DIRECTION.desc).map((i) => i.id)).toEqual([5, 3, 1, 4, 2, 6]);
  });

  it("breaks ties by name A–Z in both directions", () => {
    const asc = sortItems(ITEMS, ITEM_SORT.itemLevel, SORT_DIRECTION.asc).map((i) => i.id);
    expect(asc).toEqual([6, 2, 4, 1, 5, 3]);
  });

  it("sorts by required level and by name", () => {
    expect(sortItems(ITEMS, ITEM_SORT.requiredLevel, SORT_DIRECTION.asc)[0].id).toBe(6);
    expect(sortItems(ITEMS, ITEM_SORT.name, SORT_DIRECTION.asc).map((i) => i.name)[0]).toBe("Arcanite Reaper");
    expect(sortItems(ITEMS, ITEM_SORT.name, SORT_DIRECTION.desc).map((i) => i.name)[0]).toBe("Lionheart Helm");
  });

  it("never changes the input", () => {
    const before = ITEMS.map((i) => i.id);
    sortItems(ITEMS, ITEM_SORT.name, SORT_DIRECTION.asc);
    expect(ITEMS.map((i) => i.id)).toEqual(before);
  });
});

describe("URL params", () => {
  const types = ["Cloth", "Plate", "Axe"];

  it("reads defaults from an empty URL and writes nothing back", () => {
    const query = parseItemBrowserQuery(new URLSearchParams(), types);
    expect(query).toEqual({ filters: DEFAULT_ITEM_FILTERS, sort: ITEM_SORT.itemLevel, direction: SORT_DIRECTION.desc, view: "list", pages: 1 });
    expect(writeItemBrowserQuery(new URLSearchParams(), query).toString()).toBe("");
  });

  it("round-trips every field", () => {
    const query = {
      filters: filters({
        query: "lion",
        qualities: ["rare", "epic"],
        groups: [ITEM_CLASS_GROUP.armor],
        slots: ["head"],
        types: ["Plate"],
        changes: [ITEM_CHANGE.new],
        requiredMin: 10,
        requiredMax: 60,
        itemLevelMin: 20,
        itemLevelMax: 70,
      }),
      sort: ITEM_SORT.name,
      direction: SORT_DIRECTION.desc,
      view: "grid" as const,
      pages: 3,
    };
    const params = writeItemBrowserQuery(new URLSearchParams("keep=1"), query);
    expect(params.get("keep")).toBe("1");
    expect(params.get(ITEM_BROWSER_PARAM.quality)).toBe("rare,epic");
    expect(params.get(ITEM_BROWSER_PARAM.pages)).toBe("3");
    expect(parseItemBrowserQuery(params, types)).toEqual(query);
  });

  it("drops unknown values and bad numbers", () => {
    const params = new URLSearchParams("quality=epic,shiny&slot=head,nope&type=Plate,Laser&rmin=0&rmax=99&imin=abc&sort=price&dir=up&view=table&pages=0");
    const query = parseItemBrowserQuery(params, types);
    expect(query.filters.qualities).toEqual(["epic"]);
    expect(query.filters.slots).toEqual(["head"]);
    expect(query.filters.types).toEqual(["Plate"]);
    expect(query.filters.requiredMin).toBeNull();
    expect(query.filters.requiredMax).toBeNull();
    expect(query.filters.itemLevelMin).toBeNull();
    expect(query).toMatchObject({ sort: ITEM_SORT.itemLevel, direction: SORT_DIRECTION.desc, view: "list", pages: 1 });
  });

  it("gives each sort its own default direction and omits it from the URL", () => {
    expect(parseItemBrowserQuery(new URLSearchParams("sort=name"), types).direction).toBe(SORT_DIRECTION.asc);
    const params = writeItemBrowserQuery(new URLSearchParams(), {
      filters: DEFAULT_ITEM_FILTERS,
      sort: ITEM_SORT.name,
      direction: SORT_DIRECTION.asc,
      view: "list",
      pages: 1,
    });
    expect(params.toString()).toBe("sort=name");
  });

  it("caps the search and counts the active filters", () => {
    const long = "a".repeat(200);
    expect(parseItemBrowserQuery(new URLSearchParams({ q: long }), types).filters.query).toHaveLength(80);
    expect(activeFilterCount(filters({ qualities: ["epic", "rare"], requiredMin: 10, query: "x" }))).toBe(3);
    expect(toBoundedInt(12.6, 1, 60)).toBe(13);
    expect(toBoundedInt(0, 1, 60)).toBeNull();
    expect(clampInt(0, 1, 60)).toBe(1);
    expect(clampInt(3000, 1, 300)).toBe(300);
    expect(clampInt(1.5, 1, 60)).toBe(2);
    expect(clampInt(null, 1, 60)).toBeNull();
  });
});
