import { describe, expect, it } from "vitest";
import { guildRecipeEntry } from "@/games/wow-forever/lib/guild/guildRecipeEntries";
import { findRecipeEntry, recipeEntryLookup } from "@/games/wow-forever/lib/recipes/recipeEntryLookup";
import { recipeProfession } from "@/games/wow-forever/lib/recipes/recipeProfession";
import { exactRecipeMatch } from "@/games/wow-forever/lib/recipes/exactRecipeMatch";
import { OPEN_RECIPE_STATE } from "@/games/wow-forever/data/recipes/recipesConfig";
import { wantsOpenRecipe } from "@/games/wow-forever/lib/recipes/openRecipeState";
import { recipeHref } from "@/games/wow-forever/lib/recipes/recipeHref";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

const TAILORING = 197;
const ENCHANTING = 333;
const COOKING = 185;
const MINING = 186;

function entry(key: string, profession: RecipeEntry["profession"], name: string, makes: RecipeEntry["makes"]): RecipeEntry {
  return {
    key, profession, name, icon: null, makes, category: "other", skill: 1, yellow: null, green: null, grey: null,
    reagents: [], learn: { kind: "start" }, recipeSources: null, sourceUnknown: false, effect: null, spec: null,
    searchName: name.toLowerCase(), nameWords: [], recipeItemWords: [], reagentWords: [],
  } as RecipeEntry;
}

const LINEN = entry("tailoring:2963", "tailoring", "Bolt of Linen Cloth", { id: 2996, name: "Bolt of Linen Cloth", count: 1, quality: "common" });
const BRACER = entry("enchanting:7418", "enchanting", "Enchant Bracer - Inferior Stamina", null);
const BEAR = entry("cooking:5478", "cooking", "Smoked Bear Meat", { id: 5478, name: "Smoked Bear Meat", count: 1, quality: "common" });
const LOOKUP = recipeEntryLookup([LINEN, BRACER, BEAR]);

describe("a guild recipe's own data", () => {
  it("finds a craft by Blizzard's recipe id, through its spell", () => {
    expect(guildRecipeEntry({ id: 2359, name: "Bolt of Linen Cloth", profession_id: TAILORING }, LOOKUP)).toBe(LINEN);
    expect(guildRecipeEntry({ id: 4289, name: "Enchant Bracer - Inferior Stamina", profession_id: ENCHANTING }, LOOKUP)).toBe(BRACER);
  });

  it("finds Cooking, which has no spell map, by name in its profession", () => {
    expect(guildRecipeEntry({ id: 999999, name: "Smoked Bear Meat", profession_id: COOKING }, LOOKUP)).toBe(BEAR);
  });

  it("doesn't match a name from another profession, a profession we have no guide for, or an unknown recipe", () => {
    expect(guildRecipeEntry({ id: 999999, name: "Smoked Bear Meat", profession_id: TAILORING }, LOOKUP)).toBeNull();
    expect(guildRecipeEntry({ id: 2359, name: "Bolt of Linen Cloth", profession_id: 1 }, LOOKUP)).toBeNull();
    expect(guildRecipeEntry({ id: 999999, name: "Mystery Thing", profession_id: MINING }, LOOKUP)).toBeNull();
  });

  it("links every recipe to the Recipes page, searched in its profession", () => {
    expect(recipeHref(LINEN)).toBe("/wow-forever/recipes?q=Bolt+of+Linen+Cloth&p=tailoring");
    expect(recipeHref(BRACER)).toBe(
      "/wow-forever/recipes?q=Enchant+Bracer+-+Inferior+Stamina&p=enchanting",
    );
  });
});

describe("finding any recipe name's data", () => {
  it("finds by spell, else by name in the profession, never across professions", () => {
    expect(findRecipeEntry(LOOKUP, "tailoring", 2963, "whatever")).toBe(LINEN);
    expect(findRecipeEntry(LOOKUP, "tailoring", null, "bolt of linen cloth")).toBe(LINEN);
    expect(findRecipeEntry(LOOKUP, "enchanting", 2963, "Bolt of Linen Cloth")).toBeNull();
  });

  it("only the Recipes page's professions have recipes to link", () => {
    expect(recipeProfession("tailoring")).toBe("tailoring");
    expect(recipeProfession("cooking")).toBe("cooking");
    expect(recipeProfession("mining")).toBeNull();
    expect(recipeProfession(null)).toBeNull();
  });
});

describe("opening the linked recipe on the Recipes page", () => {
  const BOLT_USER = entry("tailoring:9999", "tailoring", "Linen Bag", null);

  it("opens the one recipe named exactly as searched", () => {
    const matches = [{ entry: LINEN, viaReagent: null }, { entry: BOLT_USER, viaReagent: "Bolt of Linen Cloth" }];
    expect(exactRecipeMatch(matches, "Bolt of  Linen Cloth")).toBe("tailoring:2963");
  });

  it("opens none for a partial name, an ingredient match, two same-named recipes or an empty search", () => {
    expect(exactRecipeMatch([{ entry: LINEN, viaReagent: null }], "bolt of linen")).toBeNull();
    expect(exactRecipeMatch([{ entry: LINEN, viaReagent: "Bolt of Linen Cloth" }], "Bolt of Linen Cloth")).toBeNull();
    const twin = { ...LINEN, key: "tailoring:1" };
    expect(exactRecipeMatch([{ entry: LINEN, viaReagent: null }, { entry: twin, viaReagent: null }], "Bolt of Linen Cloth")).toBeNull();
    expect(exactRecipeMatch([{ entry: LINEN, viaReagent: null }], "")).toBeNull();
  });

  it("only a recipe link's state asks for it", () => {
    expect(wantsOpenRecipe(OPEN_RECIPE_STATE)).toBe(true);
    expect(wantsOpenRecipe(null)).toBe(false);
    expect(wantsOpenRecipe({ backTo: "/wow-forever" })).toBe(false);
    expect(wantsOpenRecipe({ openRecipe: "yes" })).toBe(false);
  });
});
