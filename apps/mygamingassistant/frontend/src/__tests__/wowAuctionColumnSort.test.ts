import { describe, expect, it } from "vitest";
import { DEFAULT_COL_DIR, sortByColumn, toggleColumnSort } from "@/games/wow-forever/lib/auctionHouse/auctionColumnSort";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";

function price(itemId: number, name: string, marketValue: number, minBuyout: number, quantity: number): AuctionPrice {
  return { itemId, name, marketValue, minBuyout, quantity, listings: 1 };
}

const APPLE = price(1, "Apple", 500, 400, 20);
const BANANA = price(2, "Banana", 300, 200, 50);
const CHERRY = price(3, "Cherry", 700, 0, 5); // no cheapest listing
const DRAGONFRUIT = price(4, "Dragonfruit", 100, 50, 100);

const ITEMS: AuctionPrice[] = [CHERRY, BANANA, APPLE, DRAGONFRUIT];

describe("DEFAULT_COL_DIR", () => {
  it("item starts ascending (A→Z)", () => {
    expect(DEFAULT_COL_DIR.item).toBe("asc");
  });

  it("market, cheapest, onsale start descending (high→low)", () => {
    expect(DEFAULT_COL_DIR.market).toBe("desc");
    expect(DEFAULT_COL_DIR.cheapest).toBe("desc");
    expect(DEFAULT_COL_DIR.onsale).toBe("desc");
  });
});

describe("sortByColumn — item", () => {
  it("sorts A→Z ascending", () => {
    const result = sortByColumn(ITEMS, "item", "asc");
    expect(result.map((r) => r.name)).toEqual(["Apple", "Banana", "Cherry", "Dragonfruit"]);
  });

  it("sorts Z→A descending", () => {
    const result = sortByColumn(ITEMS, "item", "desc");
    expect(result.map((r) => r.name)).toEqual(["Dragonfruit", "Cherry", "Banana", "Apple"]);
  });

  it("never mutates the original array", () => {
    const original = [...ITEMS];
    sortByColumn(ITEMS, "item", "asc");
    expect(ITEMS).toEqual(original);
  });
});

describe("sortByColumn — market", () => {
  it("sorts high→low descending", () => {
    const result = sortByColumn(ITEMS, "market", "desc");
    expect(result.map((r) => r.name)).toEqual(["Cherry", "Apple", "Banana", "Dragonfruit"]);
  });

  it("sorts low→high ascending", () => {
    const result = sortByColumn(ITEMS, "market", "asc");
    expect(result.map((r) => r.name)).toEqual(["Dragonfruit", "Banana", "Apple", "Cherry"]);
  });

  it("breaks ties by name A→Z", () => {
    const a = price(10, "Zedring", 500, 400, 10);
    const b = price(11, "Amulet", 500, 400, 10);
    const result = sortByColumn([a, b], "market", "desc");
    expect(result.map((r) => r.name)).toEqual(["Amulet", "Zedring"]);
  });
});

describe("sortByColumn — cheapest", () => {
  it("sorts high→low descending, with no-price items last", () => {
    const result = sortByColumn(ITEMS, "cheapest", "desc");
    // Cherry has minBuyout=0, goes last regardless
    expect(result.map((r) => r.name)).toEqual(["Apple", "Banana", "Dragonfruit", "Cherry"]);
  });

  it("sorts low→high ascending, with no-price items last", () => {
    const result = sortByColumn(ITEMS, "cheapest", "asc");
    // Cherry has minBuyout=0, still goes last
    expect(result.map((r) => r.name)).toEqual(["Dragonfruit", "Banana", "Apple", "Cherry"]);
  });

  it("two items with no price sort stably by name", () => {
    const a = price(20, "Zeal", 300, 0, 5);
    const b = price(21, "Alpha", 300, 0, 5);
    const descResult = sortByColumn([a, b], "cheapest", "desc");
    const ascResult = sortByColumn([a, b], "cheapest", "asc");
    expect(descResult.map((r) => r.name)).toEqual(["Alpha", "Zeal"]);
    expect(ascResult.map((r) => r.name)).toEqual(["Alpha", "Zeal"]);
  });
});

describe("sortByColumn — onsale", () => {
  it("sorts high→low descending", () => {
    const result = sortByColumn(ITEMS, "onsale", "desc");
    expect(result.map((r) => r.name)).toEqual(["Dragonfruit", "Banana", "Apple", "Cherry"]);
  });

  it("sorts low→high ascending", () => {
    const result = sortByColumn(ITEMS, "onsale", "asc");
    expect(result.map((r) => r.name)).toEqual(["Cherry", "Apple", "Banana", "Dragonfruit"]);
  });
});

describe("toggleColumnSort", () => {
  it("clicking an inactive column sets it with its default direction", () => {
    expect(toggleColumnSort(null, "desc", "market")).toEqual({ colSort: "market", colDir: "desc" });
    expect(toggleColumnSort(null, "desc", "item")).toEqual({ colSort: "item", colDir: "asc" });
    expect(toggleColumnSort("market", "desc", "cheapest")).toEqual({ colSort: "cheapest", colDir: "desc" });
  });

  it("clicking the active column flips its direction", () => {
    expect(toggleColumnSort("market", "desc", "market")).toEqual({ colSort: "market", colDir: "asc" });
    expect(toggleColumnSort("market", "asc", "market")).toEqual({ colSort: "market", colDir: "desc" });
    expect(toggleColumnSort("item", "asc", "item")).toEqual({ colSort: "item", colDir: "desc" });
  });

  it("switching columns resets to the new column's default direction, ignoring old direction", () => {
    // Was on item asc; switch to onsale → onsale's default is desc
    expect(toggleColumnSort("item", "asc", "onsale")).toEqual({ colSort: "onsale", colDir: "desc" });
  });
});
