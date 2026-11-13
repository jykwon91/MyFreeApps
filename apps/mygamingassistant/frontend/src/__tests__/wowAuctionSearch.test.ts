import { describe, expect, it } from "vitest";
import { BROWSE_LIMIT, SEARCH_LIMIT } from "@/games/wow-forever/data/auctionHouse/auctionFilterOptions";
import { searchAuctionItems } from "@/games/wow-forever/prices/auctionSearch";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";

function item(itemId: number, name: string, marketValue: number, quantity = 1): AuctionPrice {
  return { itemId, name, marketValue, minBuyout: marketValue, quantity, listings: 1 };
}

const ITEMS = [
  item(1, "Linen Cloth", 100, 50),
  item(2, "Silk Cloth", 900, 20),
  item(3, "Mageweave Bolt", 500, 20),
  item(4, "Iron Ore", 300, 80),
];

const names = (r: { items: AuctionPrice[] }) => r.items.map((i) => i.name);

describe("searchAuctionItems", () => {
  it("matches a name substring, ignoring case", () => {
    expect(names(searchAuctionItems(ITEMS, "CLOTH", "name"))).toEqual(["Linen Cloth", "Silk Cloth"]);
  });

  it("matches an exact item id, not a partial one", () => {
    expect(names(searchAuctionItems(ITEMS, "4", "name"))).toEqual(["Iron Ore"]);
    expect(searchAuctionItems([item(14, "Thing", 1)], "4", "name").total).toBe(0);
  });

  it("orders by most units on sale, ties by name", () => {
    expect(names(searchAuctionItems(ITEMS, "", "supply"))).toEqual(["Iron Ore", "Linen Cloth", "Mageweave Bolt", "Silk Cloth"]);
  });

  it("orders by price both ways and by name", () => {
    expect(names(searchAuctionItems(ITEMS, "", "high"))[0]).toBe("Silk Cloth");
    expect(names(searchAuctionItems(ITEMS, "", "low"))[0]).toBe("Linen Cloth");
    expect(names(searchAuctionItems(ITEMS, "", "name"))[0]).toBe("Iron Ore");
  });

  it("caps an empty search at the browse limit and says so", () => {
    const many = Array.from({ length: 300 }, (_, i) => item(i + 1, `Item ${i}`, i));
    const r = searchAuctionItems(many, "", "high");
    expect(r.items).toHaveLength(BROWSE_LIMIT);
    expect(r.total).toBe(300);
    expect(r.capped).toBe(true);
  });

  it("caps a search at the search limit", () => {
    const many = Array.from({ length: 300 }, (_, i) => item(i + 1, `Item ${i}`, i));
    const r = searchAuctionItems(many, "item", "name");
    expect(r.items).toHaveLength(SEARCH_LIMIT);
    expect(r.total).toBe(300);
    expect(r.capped).toBe(true);
  });

  it("is not capped when everything fits", () => {
    expect(searchAuctionItems(ITEMS, "", "name").capped).toBe(false);
  });
});
