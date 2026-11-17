import { beforeAll, describe, expect, it } from "vitest";
import { loadAllCraftingData } from "@/games/wow-forever/crafting/loadCraftingData";
import { DEFAULT_DROP_RECIPE_PROFESSION, DROP_RECIPE_PROFESSIONS, DROP_RECIPES_TEXT } from "@/games/wow-forever/data/dropRecipes/dropRecipesConfig";
import { buildDropRecipes } from "@/games/wow-forever/lib/dropRecipes/buildDropRecipes";
import { dropRecipeFiltersFromParams, dropRecipeParams } from "@/games/wow-forever/lib/dropRecipes/dropRecipeParams";
import { dropRecipeSummary } from "@/games/wow-forever/lib/dropRecipes/dropRecipeSummary";
import { killsPerDrop } from "@/games/wow-forever/lib/dropRecipes/killsPerDrop";
import { knownNoteMessage } from "@/games/wow-forever/lib/dropRecipes/knownNoteMessage";
import { dropRecipeProfessions, selectDropRecipes } from "@/games/wow-forever/lib/dropRecipes/selectDropRecipes";
import type { DropRecipe } from "@/games/wow-forever/types/dropRecipes/dropRecipe";
import { DROP_RECIPE_SORT } from "@/games/wow-forever/types/dropRecipes/dropRecipeSort";
import { DROP_RECIPE_SOURCE } from "@/games/wow-forever/types/dropRecipes/dropRecipeSource";
import { DROP_RECIPE_TRADE, type DropRecipeTrade } from "@/games/wow-forever/types/dropRecipes/dropRecipeTrade";
import { INSTANCE_KIND } from "@/games/wow-forever/types/itemPages/instanceKind";

let recipes: DropRecipe[] = [];

function byName(name: string): DropRecipe {
  const found = recipes.find((r) => r.name === name);
  if (!found) throw new Error(`no drop-only recipe ${name}`);
  return found;
}

beforeAll(async () => {
  recipes = buildDropRecipes(await loadAllCraftingData());
});

describe("buildDropRecipes (committed data)", () => {
  it("leaves out recipes a vendor sells or a quest gives", () => {
    // Formula: Enchant Bracer - Minor Intellect drops, but vendors sell it too.
    expect(recipes.some((r) => r.name === "Enchant Bracer - Minor Intellect")).toBe(false);
    expect(recipes.every((r) => r.sources.length > 0)).toBe(true);
  });

  it("finds a dungeon boss drop the open-world sources never had", () => {
    const fiery = byName("Enchant Weapon - Fiery Weapon");
    expect(fiery.sources).toEqual([DROP_RECIPE_SOURCE.dungeon]);
    expect(fiery.instanceDrops[0]).toMatchObject({ name: "Pyromancer Loregrain", instance: { name: "Blackrock Depths", kind: INSTANCE_KIND.dungeon } });
    expect(fiery.bestChance).toBe(40);
  });

  it("marks raid formulas that bind when picked up", () => {
    const dodge = byName("Enchant Cloak - Dodge");
    expect(dodge.sources).toEqual([DROP_RECIPE_SOURCE.raid]);
    expect(dodge.bindOnPickup).toBe(true);
  });

  it("gives a targeted open-world mob its spot", () => {
    const crusader = byName("Enchant Weapon - Crusader");
    expect(crusader.random).toBeNull();
    expect(crusader.targets[0]).toMatchObject({ name: "Scarlet Spellbinder", chance: 0.8 });
    expect(crusader.targets[0].spot?.zoneName).toBe("Western Plaguelands");
    expect(crusader.bindOnPickup).toBe(false);
  });

  it("lists no farm mobs for a random drop, and keeps only a mob worth hunting from a random pool", () => {
    const spirit = byName("Enchant Bracer - Minor Spirit");
    expect(spirit.sources).toEqual([DROP_RECIPE_SOURCE.random]);
    expect(spirit.targets).toEqual([]);
    expect(spirit.instanceDrops).toEqual([]);
    expect(spirit.bestChance).toBe(0);
    expect(spirit.random?.mobs).toBeGreaterThan(400);

    const stamina = byName("Enchant Bracer - Greater Stamina");
    expect(stamina.sources).toEqual([DROP_RECIPE_SOURCE.openWorld, DROP_RECIPE_SOURCE.random]);
    expect(stamina.targets.every((m) => m.chance >= 1)).toBe(true);
    expect(stamina.targets).not.toHaveLength(0);
  });

  it("never offers a spot whose chance rounds to 0%: with none left it's a random drop", () => {
    expect(recipes.every((r) => [...r.targets, ...r.instanceDrops].every((m) => m.chance > 0))).toBe(true);
    const block = byName("Enchant Shield - Lesser Block");
    expect(block.sources).toEqual([DROP_RECIPE_SOURCE.random]);
    expect(block.moreTargets).toBe(0);
    expect(block.random?.zones[0]).toBe("Tanaris");
  });

  it("covers Enchanting first", () => {
    expect(dropRecipeProfessions(recipes, DROP_RECIPE_PROFESSIONS)[0]).toBe("enchanting");
    // The skeleton draws one button per profession: every crafting profession has a drop-only recipe.
    expect(dropRecipeProfessions(recipes, DROP_RECIPE_PROFESSIONS)).toEqual(DROP_RECIPE_PROFESSIONS);
  });
});

describe("selectDropRecipes", () => {
  it("filters by profession and source, sorted by skill", () => {
    const shown = selectDropRecipes(recipes, { profession: "enchanting", source: DROP_RECIPE_SOURCE.raid, sort: DROP_RECIPE_SORT.skill, trade: null });
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((r) => r.profession === "enchanting" && r.sources.includes(DROP_RECIPE_SOURCE.raid))).toBe(true);
    expect(shown.map((r) => r.skill)).toEqual([...shown.map((r) => r.skill)].sort((a, b) => a - b));
  });

  it("keeps only the tradeable ones, or only the bind-on-pickup ones", () => {
    const pick = (trade: DropRecipeTrade | null) =>
      selectDropRecipes(recipes, { profession: "enchanting", source: null, sort: DROP_RECIPE_SORT.skill, trade });
    const ah = pick(DROP_RECIPE_TRADE.auctionHouse);
    const bop = pick(DROP_RECIPE_TRADE.bindOnPickup);
    expect(ah.length).toBeGreaterThan(0);
    expect(bop.length).toBeGreaterThan(0);
    expect(ah.every((r) => !r.bindOnPickup)).toBe(true);
    expect(bop.every((r) => r.bindOnPickup)).toBe(true);
    expect(ah.length + bop.length).toBe(pick(null).length);
    expect(bop.map((r) => r.name)).toContain("Enchant Cloak - Dodge");
    expect(ah.map((r) => r.name)).toContain("Enchant Weapon - Fiery Weapon");
  });

  it("puts the best odds first and random-only drops last", () => {
    const shown = selectDropRecipes(recipes, { profession: "enchanting", source: null, sort: DROP_RECIPE_SORT.odds, trade: null });
    const chances = shown.map((r) => r.bestChance);
    expect(chances).toEqual([...chances].sort((a, b) => b - a));
    expect(shown[shown.length - 1]?.bestChance).toBe(0);
  });
});

describe("drop recipe text and params", () => {
  it("says the odds as kills", () => {
    expect(killsPerDrop(0.8)).toBe("about 1 in 125 kills");
    expect(killsPerDrop(40)).toBe("about 1 in 3 kills");
    expect(killsPerDrop(100)).toBe("nearly every kill");
    expect(killsPerDrop(0)).toBe("");
  });

  it("summarises the best spot, or the random level range", () => {
    expect(dropRecipeSummary(byName("Enchant Weapon - Fiery Weapon"))).toBe("Pyromancer Loregrain, Blackrock Depths · 40% (about 1 in 3 kills)");
    expect(dropRecipeSummary(byName("Enchant Bracer - Minor Spirit"))).toMatch(/^Random drop · mobs level 10–37$/);
  });

  it("round-trips the URL, leaving defaults out", () => {
    const filters = { profession: "tailoring", source: DROP_RECIPE_SOURCE.dungeon, sort: DROP_RECIPE_SORT.odds, trade: DROP_RECIPE_TRADE.bindOnPickup, character: "jason-kwon" } as const;
    expect(dropRecipeFiltersFromParams(dropRecipeParams(filters))).toEqual(filters);
    const plain = dropRecipeFiltersFromParams(new URLSearchParams("p=nope&source=nope&sort=nope&trade=nope"));
    expect(plain).toEqual({ profession: DEFAULT_DROP_RECIPE_PROFESSION, source: null, sort: DROP_RECIPE_SORT.skill, trade: null, character: null });
    expect(dropRecipeParams(plain).toString()).toBe("");
  });

  it("reads ?who= as a character slug, dropping a name Blizzard can't have", () => {
    expect(dropRecipeFiltersFromParams(new URLSearchParams("who=Jason Kwon")).character).toBe("jason-kwon");
    expect(dropRecipeFiltersFromParams(new URLSearchParams("who=x1")).character).toBeNull();
  });

  it("says what the picked character did to the list", () => {
    const mine = { characterName: "Jason Kwon", skill: 225, maxSkill: 300, knownSpells: new Set<number>() };
    expect(knownNoteMessage({ kind: "none" }, "Enchanting")).toBeNull();
    expect(knownNoteMessage({ kind: "error", retry: () => undefined, retrying: false }, "Enchanting")).toBeNull();
    expect(knownNoteMessage({ kind: "loading", characterName: "Jason Kwon" }, "Enchanting")).toBe("Reading Jason Kwon's recipes from Blizzard…");
    expect(knownNoteMessage({ kind: "not-found", characterName: "Jason Kwon" }, "Enchanting")).toMatch(/^Blizzard doesn't know a character named Jason Kwon/);
    expect(knownNoteMessage({ kind: "ready", mine }, "Enchanting")).toBe("Crossed out: what Jason Kwon knows (Enchanting 225 / 300).");
    expect(knownNoteMessage({ kind: "not-learned", characterName: "Jason Kwon" }, "Enchanting")).toBe("Jason Kwon hasn't learned Enchanting, so nothing is crossed out.");
    expect(DROP_RECIPES_TEXT.countKnown(58, 1, "Jason Kwon")).toBe("58 recipes · Jason Kwon knows 1");
  });
});
