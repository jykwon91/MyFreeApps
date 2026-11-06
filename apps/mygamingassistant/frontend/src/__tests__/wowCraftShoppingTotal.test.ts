import { describe, expect, it } from "vitest";
import alchemyJson from "@/games/wow-forever/data/professions/crafting/alchemy.json";
import blacksmithingJson from "@/games/wow-forever/data/professions/crafting/blacksmithing.json";
import engineeringJson from "@/games/wow-forever/data/professions/crafting/engineering.json";
import firstaidJson from "@/games/wow-forever/data/professions/crafting/firstaid.json";
import enchantingJson from "@/games/wow-forever/data/professions/crafting/enchanting.json";
import leatherworkingJson from "@/games/wow-forever/data/professions/crafting/leatherworking.json";
import tailoringJson from "@/games/wow-forever/data/professions/crafting/tailoring.json";
import sourcesJson from "@/games/wow-forever/data/professions/crafting/classic/sources.json";
import trainerSkillsJson from "@/games/wow-forever/data/professions/crafting/classic/trainerSkills.json";
import { annotateRoute, cheapestRoute, routeTotal, type CraftContext } from "@/games/wow-forever/crafting/cheapestRoute";
import { resolveRoute } from "@/games/wow-forever/crafting/craftRoute";
import { createPriceBook, type EnteredPrices, type PriceBook } from "@/games/wow-forever/crafting/matPrices";
import { isGathered } from "@/games/wow-forever/crafting/matSources";
import { shoppingList, shoppingListText, type ShoppingList } from "@/games/wow-forever/crafting/shoppingList";
import { CRAFTING_GUIDES } from "@/games/wow-forever/data/professions/crafting/craftingGuide";
import { CRAFTING_ROUTES } from "@/games/wow-forever/data/professions/crafting/craftingRoutes";
import { CRAFTING_RANKS } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import { createSourceLookup, type RawSourcesFile } from "@/games/wow-forever/data/sourceDecode";
import type { CraftingFile, CraftingProfession, CraftRecipe, ResolvedRouteEntry, TrainerSkills } from "@/games/wow-forever/types/crafting";

const SOURCES = createSourceLookup(sourcesJson as unknown as RawSourcesFile);
const FILES: Record<CraftingProfession, CraftingFile> = {
  tailoring: tailoringJson as unknown as CraftingFile,
  enchanting: enchantingJson as unknown as CraftingFile,
  alchemy: alchemyJson as unknown as CraftingFile,
  blacksmithing: blacksmithingJson as unknown as CraftingFile,
  leatherworking: leatherworkingJson as unknown as CraftingFile,
  engineering: engineeringJson as unknown as CraftingFile,
  firstaid: firstaidJson as unknown as CraftingFile,
};
const TRAINER_SKILLS = trainerSkillsJson as unknown as Record<CraftingProfession, TrainerSkills>;
const PROFESSIONS = Object.keys(FILES) as CraftingProfession[];

const SILK_CLOTH = 4306;
const BOLT_OF_SILK = 4305;
const BOLT_OF_WOOLEN = 2997;
const WOOL_CLOTH = 2592;
const SILVER = 100;

function context(profession: CraftingProfession): CraftContext {
  const file = FILES[profession];
  return {
    file,
    recipes: new Map(file.recipes.map((r) => [r.spell, r])),
    trainerSkills: TRAINER_SKILLS[profession],
    route: CRAFTING_ROUTES[profession],
    ranks: CRAFTING_RANKS[profession],
    professionLabel: CRAFTING_GUIDES[profession].label,
  };
}

const gathered = (id: number) => isGathered(SOURCES.reagent(id));

/** What the shopping list component does: the same price book decides buy-or-make and costs each line. */
function listFor(entries: readonly ResolvedRouteEntry[], profession: CraftingProfession, book: PriceBook): ShoppingList {
  return shoppingList(entries, null, FILES[profession], CRAFTING_GUIDES[profession].label, gathered, book.buyInstead);
}

/** What CraftShoppingTotal adds up: lines with a price; the rest are "not counting". */
function listTotal(list: ShoppingList, book: PriceBook): number {
  return list.buy.reduce((sum, l) => sum + (book.item(l.id, l.name).price ?? 0) * l.count, 0);
}

function routeFor(profession: CraftingProfession, prices: EnteredPrices) {
  const ctx = context(profession);
  const book = createPriceBook(prices, ctx.file, ctx.professionLabel);
  if (profession === "tailoring" || profession === "enchanting") {
    const route = cheapestRoute(ctx, 1, book, { knownFormulas: new Set(), excludedSlots: new Set() });
    return { book, entries: route.entries, total: route.total };
  }
  const entries = annotateRoute(resolveRoute(ctx.route, ctx.recipes, ctx.trainerSkills), book, 1);
  return { book, entries, total: routeTotal(entries, 1).total };
}

describe("buying a bolt whose raw cloth has no auction price", () => {
  const silkPriced: EnteredPrices = { [BOLT_OF_SILK]: 45 * SILVER };

  it("lists the bolts to buy, says why, and prices them", () => {
    const { book, entries } = routeFor("tailoring", silkPriced);
    const list = listFor(entries, "tailoring", book);
    const bolts = list.buy.find((l) => l.id === BOLT_OF_SILK);
    expect(bolts?.buyNote).toBe("Silk Cloth has no auction price yet");
    expect(bolts?.count).toBeGreaterThan(0);
    expect(book.item(BOLT_OF_SILK, "Bolt of Silk Cloth").price).toBe(45 * SILVER);
    expect(list.make.find((l) => l.id === BOLT_OF_SILK)).toBeUndefined();
    expect(shoppingListText(list)).toMatch(/^\d+x Bolt of Silk Cloth — buy these; Silk Cloth has no auction price yet$/m);
  });

  it("counts the bolts in the total, so it covers the route", () => {
    const { book, entries, total } = routeFor("tailoring", silkPriced);
    const list = listFor(entries, "tailoring", book);
    const bolts = list.buy.find((l) => l.id === BOLT_OF_SILK)!;
    expect(listTotal(list, book)).toBeGreaterThanOrEqual(bolts.count * 45 * SILVER);
    expect(listTotal(list, book)).toBeGreaterThanOrEqual(Math.floor(total));
  });

  it("does the same for Woolen bolts", () => {
    const { book, entries } = routeFor("tailoring", { [BOLT_OF_WOOLEN]: 20 * SILVER });
    const bolts = listFor(entries, "tailoring", book).buy.find((l) => l.id === BOLT_OF_WOOLEN);
    expect(bolts?.buyNote).toBe("Wool Cloth has no auction price yet");
  });
});

describe("bolts when both the bolt and its cloth are priced", () => {
  it("makes them when the cloth is cheaper", () => {
    const { book, entries } = routeFor("tailoring", { [SILK_CLOTH]: 5 * SILVER, [BOLT_OF_SILK]: 45 * SILVER });
    const list = listFor(entries, "tailoring", book);
    expect(list.buy.find((l) => l.id === BOLT_OF_SILK)).toBeUndefined();
    expect(list.buy.find((l) => l.id === SILK_CLOTH)).toBeDefined();
    expect(list.make.find((l) => l.id === BOLT_OF_SILK)).toBeDefined();
  });

  it("buys them when the bolt is cheaper, as the route prices them", () => {
    const { book, entries, total } = routeFor("tailoring", { [SILK_CLOTH]: 40 * SILVER, [BOLT_OF_SILK]: 45 * SILVER });
    const list = listFor(entries, "tailoring", book);
    expect(list.buy.find((l) => l.id === BOLT_OF_SILK)?.buyNote).toBe("cheaper than making it");
    expect(listTotal(list, book)).toBeGreaterThanOrEqual(Math.floor(total));
  });
});

describe("bolts when neither is priced", () => {
  it("still lists the raw cloth, which has no auction price", () => {
    const { book, entries } = routeFor("tailoring", { [WOOL_CLOTH]: 10 * SILVER });
    const list = listFor(entries, "tailoring", book);
    expect(book.buyInstead(BOLT_OF_SILK)).toBeNull();
    expect(list.buy.find((l) => l.id === BOLT_OF_SILK)).toBeUndefined();
    const silk = list.buy.find((l) => l.id === SILK_CLOTH);
    expect(silk).toBeDefined();
    expect(silk?.buyNote).toBeUndefined();
    expect(book.item(SILK_CLOTH, "Silk Cloth").price).toBeUndefined();
  });
});

describe("the shopping list never costs less than the route it covers", () => {
  /** Small deterministic generator, so a failure names a repeatable price map. */
  function random(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  function itemIds(profession: CraftingProfession): number[] {
    const ids = new Set<number>();
    const add = (recipe: CraftRecipe) => {
      for (const r of recipe.reagents) ids.add(r.id);
      if (recipe.creates) ids.add(recipe.creates.id);
    };
    FILES[profession].recipes.forEach(add);
    return [...ids];
  }

  it.each(PROFESSIONS)("%s, over many partly-priced markets", (profession) => {
    const ids = itemIds(profession);
    for (let seed = 1; seed <= 25; seed++) {
      const next = random(seed);
      const prices: Record<string, number> = {};
      const coverage = 0.3 + 0.7 * next();
      for (const id of ids) if (next() < coverage) prices[String(id)] = Math.round(10 + next() * 20_000);
      const { book, entries, total } = routeFor(profession, prices);
      const list = listFor(entries, profession, book);
      expect(listTotal(list, book), `${profession} seed ${seed}`).toBeGreaterThanOrEqual(Math.floor(total));
    }
  });
});
