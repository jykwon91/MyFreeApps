import { describe, expect, it } from "vitest";
import { loadCraftingData } from "@/games/wow-forever/crafting/loadCraftingData";
import { AUCTION_MATERIAL_PROFESSIONS } from "@/games/wow-forever/data/auctionHouse/auctionMaterialProfessions";
import {
  craftProfit,
  findRecipes,
  professionMaterials,
  RECIPE_MATCH_LIMIT,
  recipeOptions,
  recipePriceBreakdown,
  searchProfessionMaterials,
} from "@/games/wow-forever/lib/auctionHouse/professionMaterials";
import { parseRecipeParam } from "@/games/wow-forever/lib/auctionHouse/parseRecipeParam";
import { signedPrice } from "@/games/wow-forever/lib/auctionHouse/signedPrice";
import { CRAFTING_PROFESSION, type CraftRecipe } from "@/games/wow-forever/types/crafting";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";

function price(itemId: number, name: string, marketValue: number, quantity = 10): AuctionPrice {
  return { itemId, name, marketValue, minBuyout: marketValue, quantity, listings: 2 };
}

function recipe(spell: number, name: string, yellow: number, reagents: [number, string, number][], creates?: [number, string, number]): CraftRecipe {
  return {
    spell,
    name,
    yellow,
    grey: yellow + 20,
    reagents: reagents.map(([id, n, count]) => ({ id, name: n, count })),
    creates: creates ? { id: creates[0], name: creates[1], count: creates[2], quality: 1 } : undefined,
    learn: { source: "trainer" },
  };
}

const ROD = recipe(1, "Runed Copper Rod", 5, [[6217, "Copper Rod", 1], [10940, "Strange Dust", 2]], [6218, "Runed Copper Rod", 1]);
const ENCHANT = recipe(2, "Enchant Bracer - Minor Health", 1, [[10940, "Strange Dust", 1]]);
const OIL = recipe(3, "Minor Wizard Oil", 45, [[10940, "Strange Dust", 2], [17034, "Maple Seed", 1]], [20744, "Minor Wizard Oil", 1]);

describe("professionMaterials", () => {
  it("lists every reagent once, by id", () => {
    expect([...professionMaterials([ROD, ENCHANT, OIL])]).toEqual([
      [6217, "Copper Rod"],
      [10940, "Strange Dust"],
      [17034, "Maple Seed"],
    ]);
  });

  it("finds materials in every profession's real recipe data", async () => {
    for (const { id } of AUCTION_MATERIAL_PROFESSIONS) {
      const data = await loadCraftingData(id);
      expect(professionMaterials(data.file.recipes).size, id).toBeGreaterThan(0);
    }
  });

  it("knows Enchanting uses Strange Dust and never lists Linen Cloth", async () => {
    const data = await loadCraftingData(CRAFTING_PROFESSION.enchanting);
    const materials = professionMaterials(data.file.recipes);
    expect(materials.get(10940)).toBe("Strange Dust");
    expect(materials.has(2589)).toBe(false);
  });
});

describe("searchProfessionMaterials", () => {
  const materials = professionMaterials([ROD, ENCHANT, OIL]);
  const byId = new Map([
    [10940, price(10940, "Strange Dust", 300, 500)],
    [6217, price(6217, "Copper Rod", 120, 5)],
    [2589, price(2589, "Linen Cloth", 50, 9000)],
  ]);

  it("keeps only the profession's materials on sale, and counts the ones that aren't", () => {
    const result = searchProfessionMaterials(materials, byId, "", "supply");
    expect(result.items.map((i) => i.name)).toEqual(["Strange Dust", "Copper Rod"]);
    expect(result.total).toBe(2);
    expect(result.notOnSale).toBe(1);
    expect(result.capped).toBe(false);
  });

  it("applies the search to both counts", () => {
    const result = searchProfessionMaterials(materials, byId, "seed", "supply");
    expect(result.items).toEqual([]);
    expect(result.notOnSale).toBe(1);
    expect(searchProfessionMaterials(materials, byId, "dust", "name").notOnSale).toBe(0);
  });
});

describe("recipe picker", () => {
  const options = recipeOptions([OIL, ROD, ENCHANT]);

  it("orders recipes by the skill they turn yellow at and labels them with it", () => {
    expect(options).toEqual([
      { spell: 2, label: "Enchant Bracer - Minor Health (1)", icon: null },
      { spell: 1, label: "Runed Copper Rod (5)", icon: expect.anything() },
      { spell: 3, label: "Minor Wizard Oil (45)", icon: expect.anything() },
    ]);
  });

  it("finds recipes by every typed word in any order, and nothing when nothing is typed", () => {
    expect(findRecipes(options, "rod copper").map((o) => o.spell)).toEqual([1]);
    expect(findRecipes(options, "  ")).toEqual([]);
    expect(findRecipes(options, "xyz")).toEqual([]);
  });

  it("lists a few matches at most", async () => {
    const data = await loadCraftingData(CRAFTING_PROFESSION.enchanting);
    expect(findRecipes(recipeOptions(data.file.recipes), "enchant")).toHaveLength(RECIPE_MATCH_LIMIT);
  });

  it("reads a spell id from ?recipe= and nothing else", () => {
    expect(parseRecipeParam("7421")).toBe(7421);
    expect(parseRecipeParam(null)).toBeNull();
    expect(parseRecipeParam("12a")).toBeNull();
    expect(parseRecipeParam("-1")).toBeNull();
  });
});

describe("recipePriceBreakdown", () => {
  it("prices each material by count × market value and totals them, with what the item sells for", () => {
    const byId = new Map([
      [6217, price(6217, "Copper Rod", 120)],
      [10940, price(10940, "Strange Dust", 300)],
      [6218, price(6218, "Runed Copper Rod", 1000)],
    ]);
    const breakdown = recipePriceBreakdown(ROD, byId);
    expect(breakdown.lines.map((l) => [l.name, l.count, l.cost])).toEqual([
      ["Copper Rod", 1, 120],
      ["Strange Dust", 2, 600],
    ]);
    expect(breakdown.materialsCost).toBe(720);
    expect(breakdown.unpriced).toBe(0);
    expect(breakdown.product?.price?.marketValue).toBe(1000);
    expect(craftProfit(breakdown)).toBe(280);
  });

  it("leaves materials with no auctions out of the total and gives no profit", () => {
    const breakdown = recipePriceBreakdown(ROD, new Map([[10940, price(10940, "Strange Dust", 300)]]));
    expect(breakdown.lines[0]).toMatchObject({ price: null, cost: null });
    expect(breakdown.materialsCost).toBe(600);
    expect(breakdown.unpriced).toBe(1);
    expect(breakdown.product?.price).toBeNull();
    expect(craftProfit(breakdown)).toBeNull();
  });

  it("has no product for an enchant", () => {
    const breakdown = recipePriceBreakdown(ENCHANT, new Map([[10940, price(10940, "Strange Dust", 300)]]));
    expect(breakdown.product).toBeNull();
    expect(craftProfit(breakdown)).toBeNull();
  });

  it("writes gains and losses with a sign", () => {
    expect(signedPrice(280)).toBe("+2s 80c");
    expect(signedPrice(-10_050)).toBe("−1g 50c");
    expect(signedPrice(0)).toBe("0c");
  });
});
