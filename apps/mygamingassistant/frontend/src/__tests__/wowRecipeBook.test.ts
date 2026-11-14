import { beforeAll, describe, expect, it } from "vitest";
import itemCategoriesJson from "@/games/wow-forever/data/items/itemCategories.json";
import { loadAllCraftingData } from "@/games/wow-forever/crafting/loadCraftingData";
import { FOODS, TRAINER_SKILLS } from "@/games/wow-forever/data/food/foodData";
import { FOOD_SOURCES } from "@/games/wow-forever/data/food/recipeSourceData";
import { decodeItemCategories } from "@/games/wow-forever/lib/auctionHouse/decodeItemCategories";
import { buildRecipeBook } from "@/games/wow-forever/lib/recipes/buildRecipeBook";
import { learnSummary } from "@/games/wow-forever/lib/recipes/learnSummary";
import { searchRecipes } from "@/games/wow-forever/lib/recipes/searchRecipes";
import type { ItemCategoriesFile } from "@/games/wow-forever/types/auctionHouse/itemCategoriesFile";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

let book: RecipeEntry[] = [];

beforeAll(async () => {
  const crafting = await loadAllCraftingData();
  book = buildRecipeBook({
    crafting,
    foods: FOODS,
    foodTrainerSkills: TRAINER_SKILLS,
    foodSources: FOOD_SOURCES,
    categories: decodeItemCategories(itemCategoriesJson as unknown as ItemCategoriesFile),
  });
});

function find(name: string, profession?: RecipeEntry["profession"]): RecipeEntry {
  const entry = book.find((e) => e.name === name && (profession === undefined || e.profession === profession));
  if (!entry) throw new Error(`${name} is not in the recipe book`);
  return entry;
}

describe("the recipe book, from the real data", () => {
  it("holds every crafting profession and Cooking, each recipe once", () => {
    const professions = new Set(book.map((e) => e.profession));
    expect([...professions].sort()).toEqual(["alchemy", "blacksmithing", "cooking", "enchanting", "engineering", "firstaid", "leatherworking", "tailoring"]);
    expect(new Set(book.map((e) => e.key)).size).toBe(book.length);
  });

  it("files what a recipe makes by the game's item class", () => {
    expect(find("Linen Bandage").category).toBe("bandages");
    expect(find("Minor Healing Potion").category).toBe("potions");
    expect(find("Copper Axe").category).toBe("weapons");
    expect(find("Linen Bag").category).toBe("bags");
    expect(find("Light Leather Quiver").category).toBe("bags");
    expect(find("Bolt of Linen Cloth").category).toBe("trade-goods");
    expect(find("Crafted Light Shot").category).toBe("ammo");
    expect(find("Rough Dynamite").category).toBe("explosives");
    expect(find("Spiced Wolf Meat", "cooking").category).toBe("food");
  });

  it("names the armor type of gear, and makes no item for an enchant", () => {
    const shirt = find("Brown Linen Shirt");
    expect(shirt.category).toBe("armor");
    const bracer = find("Enchant Bracer - Inferior Stamina");
    expect(bracer.category).toBe("enchants");
    expect(bracer.makes).toBeNull();
  });

  it("says where a recipe item comes from, from the Classic sources", () => {
    const vendorRecipe = book.find((e) => e.learn.kind === "item" && (e.recipeSources?.vendors.length ?? 0) > 0);
    expect(vendorRecipe && learnSummary(vendorRecipe)).toContain("Vendor");
    const trained = find("Bolt of Linen Cloth");
    expect(learnSummary(trained)).toBe("Known from the start");
  });

  it("joins Cooking recipes learned from a Recipe item to that item's sources", () => {
    const cooked = book.filter((e) => e.profession === "cooking" && e.learn.kind === "item");
    expect(cooked.length).toBeGreaterThan(0);
    expect(cooked.some((e) => (e.recipeSources?.vendors.length ?? 0) > 0)).toBe(true);
  });

  it("finds a recipe by an ingredient, after the recipes named for it", () => {
    const hits = searchRecipes(book, { query: "silk cloth", profession: undefined, category: undefined });
    expect(hits[0]?.viaReagent).toBeNull();
    expect(hits.some((h) => h.viaReagent === "Silk Cloth")).toBe(true);
  });
});
