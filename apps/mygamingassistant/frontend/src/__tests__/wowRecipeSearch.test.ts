import { describe, expect, it } from "vitest";
import { nameWords, normalizeItemName } from "@/games/wow-forever/lib/itemSearch";
import { learnSummary } from "@/games/wow-forever/lib/recipes/learnSummary";
import { recipeCategory } from "@/games/wow-forever/lib/recipes/recipeCategory";
import { parseRecipeCategory, parseRecipeProfession, withRecipeParam } from "@/games/wow-forever/lib/recipes/recipeParams";
import { hasRecipeSearch, searchRecipes } from "@/games/wow-forever/lib/recipes/searchRecipes";
import type { CraftReagent, LearnAt } from "@/games/wow-forever/types/crafting";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";
import type { RecipeProfession } from "@/games/wow-forever/types/recipes/recipeProfession";

interface EntryInput {
  name: string;
  skill?: number;
  profession?: RecipeProfession;
  category?: RecipeEntry["category"];
  reagents?: CraftReagent[];
  recipeItem?: string;
  learn?: LearnAt;
  sourceUnknown?: boolean;
}

function entry({ name, skill = 1, profession = "tailoring", category = "armor", reagents = [], recipeItem, learn, sourceUnknown = false }: EntryInput): RecipeEntry {
  const searchName = normalizeItemName(name);
  return {
    key: `${profession}:${name}`,
    profession,
    name,
    icon: null,
    makes: null,
    category,
    skill,
    yellow: null,
    green: null,
    grey: null,
    reagents,
    learn: learn ?? { kind: "start" },
    recipeSources: null,
    sourceUnknown,
    effect: null,
    spec: null,
    searchName,
    nameWords: nameWords(searchName),
    recipeItemWords: recipeItem ? nameWords(normalizeItemName(recipeItem)) : [],
    reagentWords: reagents.map((r) => nameWords(normalizeItemName(r.name))),
  };
}

const SILK = { id: 4306, name: "Silk Cloth", count: 2 };
const BOOK = [
  entry({ name: "Silk Headband", skill: 160, reagents: [SILK] }),
  entry({ name: "Bolt of Silk Cloth", skill: 125, reagents: [{ ...SILK, count: 4 }], category: "trade-goods" }),
  entry({ name: "Azure Silk Hood", skill: 145, reagents: [SILK] }),
  entry({ name: "Silk Cloth Bag", skill: 140 }),
  entry({ name: "Heavy Silk Bandage", skill: 80, profession: "firstaid", category: "bandages", reagents: [SILK] }),
  entry({ name: "Crimson Silk Belt", skill: 175, recipeItem: "Pattern: Crimson Silk Belt" }),
  entry({ name: "Spider Belt", skill: 180, recipeItem: "Pattern: Webbed Belt" }),
  entry({ name: "Linen Cloak", skill: 1 }),
  entry({ name: "Silk Sash", skill: 85, reagents: [{ id: 4305, name: "Bolt of Silk Cloth", count: 8 }] }),
];

const names = (query: string, extra: Partial<Parameters<typeof searchRecipes>[1]> = {}) =>
  searchRecipes(BOOK, { query, profession: undefined, category: undefined, ...extra }).map((m) => m.entry.name);

describe("searchRecipes", () => {
  it("puts the exact name first, then names that start with it, then names with the words", () => {
    expect(names("silk cloth bag")[0]).toBe("Silk Cloth Bag");
    const silk = names("silk");
    expect(silk.slice(0, 3)).toEqual(["Silk Sash", "Silk Cloth Bag", "Silk Headband"]);
    expect(silk).toContain("Azure Silk Hood");
  });

  it("finds a recipe by its recipe item, and then by an ingredient, saying which one", () => {
    expect(names("webbed")).toEqual(["Spider Belt"]);
    const hits = searchRecipes(BOOK, { query: "silk cloth", profession: undefined, category: undefined });
    expect(hits[0]?.entry.name).toBe("Silk Cloth Bag");
    const viaReagent = hits.filter((h) => h.viaReagent === "Silk Cloth").map((h) => h.entry.name);
    expect(viaReagent).toEqual(["Heavy Silk Bandage", "Azure Silk Hood", "Silk Headband"]);
    // The exact ingredient comes before an ingredient that only has its words (Bolt of Silk Cloth).
    expect(hits.map((h) => h.entry.name).slice(-1)).toEqual(["Silk Sash"]);
    expect(hits[hits.length - 1]?.viaReagent).toBe("Bolt of Silk Cloth");
  });

  it("forgives a one-letter typo, ranked last", () => {
    expect(names("linnen cloak")).toEqual(["Linen Cloak"]);
  });

  it("narrows by profession and by what it makes, and lists by skill with no query", () => {
    expect(names("silk", { profession: "firstaid" })).toEqual(["Heavy Silk Bandage"]);
    expect(names("", { category: "trade-goods" })).toEqual(["Bolt of Silk Cloth"]);
    expect(names("", { profession: "tailoring" })[0]).toBe("Linen Cloak");
  });

  it("only lists anything once there's a query or a filter", () => {
    expect(hasRecipeSearch({ query: "  ", profession: undefined, category: undefined })).toBe(false);
    expect(hasRecipeSearch({ query: "", profession: "cooking", category: undefined })).toBe(true);
    expect(hasRecipeSearch({ query: "", profession: undefined, category: "food" })).toBe(true);
  });
});

describe("recipeCategory", () => {
  const base = { profession: "blacksmithing" as const, enchant: false, place: undefined, itemClass: undefined };

  it("files an enchant as an enchant whatever else it says", () => {
    expect(recipeCategory({ ...base, enchant: true, itemClass: 2 })).toBe("enchants");
  });

  it("tells weapons from armor by the item class the Auction house folds together", () => {
    expect(recipeCategory({ ...base, itemClass: 2, place: { category: "gear", subclass: null } })).toBe("weapons");
    expect(recipeCategory({ ...base, itemClass: 4, place: { category: "gear", subclass: null } })).toBe("armor");
  });

  it("files consumables by subclass, and bags, ammo and trade goods by their place", () => {
    expect(recipeCategory({ ...base, place: { category: "consumable", subclass: 1 } })).toBe("potions");
    expect(recipeCategory({ ...base, place: { category: "consumable", subclass: 99 } })).toBe("consumables");
    expect(recipeCategory({ ...base, place: { category: "quiver", subclass: 2 } })).toBe("bags");
    expect(recipeCategory({ ...base, place: { category: "projectile", subclass: 2 } })).toBe("ammo");
    expect(recipeCategory({ ...base, place: { category: "reagent", subclass: 0 } })).toBe("trade-goods");
  });

  it("falls back to Cooking's food and First Aid's bandages, else the item class", () => {
    expect(recipeCategory({ ...base, profession: "cooking" })).toBe("food");
    expect(recipeCategory({ ...base, profession: "firstaid" })).toBe("bandages");
    expect(recipeCategory({ ...base, itemClass: 1 })).toBe("bags");
    expect(recipeCategory(base)).toBe("other");
  });
});

describe("recipe params", () => {
  it("reads only known professions and categories", () => {
    expect(parseRecipeProfession(new URLSearchParams("p=cooking"))).toBe("cooking");
    expect(parseRecipeProfession(new URLSearchParams("p=fishing"))).toBeUndefined();
    expect(parseRecipeCategory(new URLSearchParams("c=weapons"))).toBe("weapons");
    expect(parseRecipeCategory(new URLSearchParams("c=mounts"))).toBeUndefined();
  });

  it("sets or removes one param and keeps the rest", () => {
    const start = new URLSearchParams("q=silk&p=tailoring");
    expect(withRecipeParam(start, "c", "armor").toString()).toBe("q=silk&p=tailoring&c=armor");
    expect(withRecipeParam(start, "p", undefined).toString()).toBe("q=silk");
    expect(start.toString()).toBe("q=silk&p=tailoring");
  });
});

describe("learnSummary", () => {
  const itemLearn: LearnAt = { kind: "item", skill: 200, itemId: 1, item: "Pattern: X", estimated: false };

  it("says when a recipe item has no known source, and leaves a Forever-only recipe to its chip", () => {
    expect(learnSummary(entry({ name: "A", learn: itemLearn }))).toBe("No source listed");
    expect(learnSummary(entry({ name: "B", learn: itemLearn, sourceUnknown: true }))).toBeNull();
    expect(learnSummary(entry({ name: "C", learn: { kind: "trainer", skill: 50, estimated: false, newInForever: false } }))).toBe("Trainer");
  });

  it("names a Classic quest or NPC instead of a trainer", () => {
    expect(learnSummary(entry({ name: "D", learn: { kind: "quest", skill: 285, quests: [{ id: 6032, title: "Sacred Cloth" }] } }))).toBe("Quest");
    expect(learnSummary(entry({ name: "E", learn: { kind: "npc", skill: 230, npcs: ["Gloom'rel"] } }))).toBe("NPC");
  });
});
