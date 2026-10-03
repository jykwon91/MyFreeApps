import { describe, expect, it } from "vitest";
import tailoringJson from "@/games/wow-forever/data/professions/crafting/tailoring.json";
import enchantingJson from "@/games/wow-forever/data/professions/crafting/enchanting.json";
import trainerSkillsJson from "@/games/wow-forever/data/professions/crafting/classic/trainerSkills.json";
import { learnSkill, MAX_CRAFT_SKILL, skillColors } from "@/games/wow-forever/crafting/craftRoute";
import {
  cheapestRoute,
  enchantSlot,
  formulaChoices,
  priceItems,
  type CraftContext,
  type EnchantSlot,
  type RouteChoices,
} from "@/games/wow-forever/crafting/cheapestRoute";
import { createPriceBook, formatCost, formatPrice, parsePrice, type EnteredPrices } from "@/games/wow-forever/crafting/matPrices";
import { CRAFTING_GUIDES } from "@/games/wow-forever/data/professions/crafting/craftingGuide";
import { CRAFTING_ROUTES } from "@/games/wow-forever/data/professions/crafting/craftingRoutes";
import { CRAFTING_RANKS } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import type { CraftingFile, CraftingProfession, ResolvedRouteEntry, TrainerSkills } from "@/games/wow-forever/types/crafting";

const FILES: Record<CraftingProfession, CraftingFile> = {
  tailoring: tailoringJson as unknown as CraftingFile,
  enchanting: enchantingJson as unknown as CraftingFile,
};
const TRAINER_SKILLS = trainerSkillsJson as unknown as Record<CraftingProfession, TrainerSkills>;

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

const NO_CHOICES: RouteChoices = { knownFormulas: new Set(), excludedSlots: new Set() };

const STRANGE_DUST = 10940;
const LESSER_MAGIC = 10938;
const GREATER_MAGIC = 10939;
const LESSER_ASTRAL = 10998;
const GREATER_ASTRAL = 11082;
const SMALL_SHARD = 10978;
const DREAM_DUST = 11176;
const LINEN_CLOTH = 2589;
const BOLT_OF_LINEN = 2996;
const CLOAK_MINOR_AGILITY = 13419;

const SILVER = 100;
const GOLD = 10_000;

describe("parsePrice", () => {
  it.each([
    ["1g 20s 5c", 12005],
    ["1g20s", 12000],
    ["120s", 12000],
    ["1.2g", 12000],
    ["1.5g", 15000],
    ["45s", 4500],
    ["80c", 80],
    ["35", 3500],
    [" 2 G ", 20000],
    ["0", 0],
  ])("%s -> %i copper", (text, copper) => {
    expect(parsePrice(text)).toBe(copper);
  });

  it.each(["", "abc", "1g 1g", "1g 20", "-5s", "1..5g", "100000g", "5x"])("rejects %j", (text) => {
    expect(parsePrice(text)).toBeNull();
  });

  it("accepts the cap", () => {
    expect(parsePrice("99999g")).toBe(99_999 * GOLD);
  });
});

describe("formatPrice and formatCost", () => {
  it("leaves out zero parts", () => {
    expect(formatPrice(12005)).toBe("1g 20s 5c");
    expect(formatPrice(12000)).toBe("1g 20s");
    expect(formatPrice(5)).toBe("5c");
    expect(formatPrice(0)).toBe("0c");
  });

  it("rounds costs to the silver above a gold, to the copper below", () => {
    expect(formatCost(12_049)).toBe("~1g 20s");
    expect(formatCost(12_051)).toBe("~1g 21s");
    expect(formatCost(4_512.4)).toBe("~45s 12c");
  });
});

describe("createPriceBook", () => {
  const ench = FILES.enchanting;

  it("converts essences both ways, at the cheaper side", () => {
    const book = createPriceBook({ [GREATER_MAGIC]: 30 * SILVER, [LESSER_MAGIC]: 20 * SILVER }, ench, "Enchanting");
    expect(book.item(LESSER_MAGIC, "LME").price).toBe(10 * SILVER);
    expect(book.item(GREATER_MAGIC, "GME").price).toBe(30 * SILVER);
    const onlyLesser = createPriceBook({ [LESSER_ASTRAL]: 5 * SILVER }, ench, "Enchanting");
    expect(onlyLesser.item(GREATER_ASTRAL, "GAE").price).toBe(15 * SILVER);
  });

  it("prices a self-made bolt from its cloth", () => {
    const book = createPriceBook({ [LINEN_CLOTH]: 10 }, FILES.tailoring, "Tailoring");
    // Bolt of Linen Cloth = 2 Linen Cloth.
    expect(book.item(BOLT_OF_LINEN, "Bolt").price).toBe(20);
  });

  it("keeps unknown as unknown and names the raw item to price", () => {
    const book = createPriceBook({}, FILES.tailoring, "Tailoring");
    const bolt = book.item(BOLT_OF_LINEN, "Bolt of Linen Cloth");
    expect(bolt.price).toBeUndefined();
    expect(bolt.missing.map((m) => m.id)).toEqual([LINEN_CLOTH]);
  });

  it("treats 0 as free, not unknown", () => {
    const book = createPriceBook({ [STRANGE_DUST]: 0 }, ench, "Enchanting");
    expect(book.item(STRANGE_DUST, "Dust").price).toBe(0);
  });
});

describe("enchantSlot", () => {
  it("reads the slot from the name", () => {
    expect(enchantSlot("Enchant 2H Weapon - Minor Impact")).toBe("2H Weapon");
    expect(enchantSlot("Enchant Cloak - Lesser Protection")).toBe("Cloak");
    expect(enchantSlot("Runed Copper Rod")).toBeNull();
    expect(enchantSlot("Enchanted Leather")).toBeNull();
  });
});

/** Price everything the route or any recipe uses, at 1s, then override. */
function priceAll(profession: CraftingProfession, overrides: EnteredPrices, choices: RouteChoices = NO_CHOICES): EnteredPrices {
  const items = priceItems(context(profession), 1, choices);
  const out: Record<string, number> = {};
  for (const item of [...items.main, ...items.more]) out[String(item.id)] = SILVER;
  return { ...out, ...overrides };
}

function spellsBetween(entries: readonly ResolvedRouteEntry[], from: number, to: number): number[] {
  return entries.flatMap((e) => (e.kind === "craft" && e.step.from < to && e.step.to > from ? [e.recipe.spell] : []));
}

/** [a, a, b, a] -> [a, b, a]: the same recipe split at a rank-up is still one stretch. */
function dedupe(spells: readonly number[]): number[] {
  return spells.filter((s, i) => i === 0 || spells[i - 1] !== s);
}

function usesItem(entries: readonly ResolvedRouteEntry[], from: number, to: number, itemId: number): boolean {
  return entries.some((e) => e.kind === "craft" && e.step.from < to && e.step.to > from && e.recipe.reagents.some((r) => r.id === itemId));
}

function expectValid(profession: CraftingProfession, entries: readonly ResolvedRouteEntry[], start: number, choices: RouteChoices) {
  const ctx = context(profession);
  expect(entries[0].step.from).toBe(1);
  expect(entries[entries.length - 1].step.to).toBe(MAX_CRAFT_SKILL);
  for (let i = 1; i < entries.length; i++) expect(entries[i].step.from, `row ${i}`).toBe(entries[i - 1].step.to);
  const made = new Map<number, number>();
  let cap = 75;
  for (const entry of entries) {
    const reached = ctx.ranks.filter((r) => r.skill <= entry.step.from);
    const rank = CRAFTING_RANKS[profession].find((r) => r.skill === reached[reached.length - 1]?.skill);
    if (rank) cap = rank.cap;
    expect(entry.step.to, `${entry.step.from}-${entry.step.to} rank cap`).toBeLessThanOrEqual(cap);
    if (entry.kind !== "craft") continue;
    const name = `${entry.step.from}-${entry.step.to} ${entry.recipe.name}`;
    expect(learnSkill(entry.learn), name).toBeLessThanOrEqual(entry.step.from);
    expect(entry.step.to, name).toBeLessThan(entry.recipe.grey);
    if (entry.recipe.tool && entry.step.to > start) {
      expect(made.get(entry.recipe.tool.id) ?? Infinity, `${name} needs its rod`).toBeLessThanOrEqual(entry.step.from);
    }
    if (entry.source === "priced") {
      // A picked row never runs into green ("green — move on").
      expect(entry.step.to, `${name} stays orange/yellow`).toBeLessThanOrEqual(skillColors(entry.recipe).green);
    }
    if (entry.source === "priced" && entry.recipe.learn.source === "item") {
      expect(choices.knownFormulas.has(entry.recipe.spell), name).toBe(true);
    }
    if (entry.recipe.creates) made.set(entry.recipe.creates.id, entry.step.to);
  }
}

describe("cheapestRoute — Enchanting", () => {
  const ctx = context("enchanting");
  const cloakChoices: RouteChoices = { knownFormulas: new Set([CLOAK_MINOR_AGILITY]), excludedSlots: new Set() };

  it("stays off Lesser Astral Essence at 111–130 when it's dear", () => {
    const prices = priceAll("enchanting", {
      [LESSER_ASTRAL]: 5 * GOLD,
      [GREATER_ASTRAL]: 15 * GOLD,
      [STRANGE_DUST]: 20,
      [SMALL_SHARD]: 50,
      [LESSER_MAGIC]: 30,
    }, cloakChoices);
    const book = createPriceBook(prices, ctx.file, ctx.professionLabel);
    const route = cheapestRoute(ctx, 111, book, cloakChoices);
    expect(usesItem(route.entries, 111, 130, LESSER_ASTRAL)).toBe(false);
    expect(route.priced).toBe(true);
    expectValid("enchanting", route.entries, 111, cloakChoices);
  });

  it("may use the cloak formula when Lesser Astral is cheap and the formula is ticked", () => {
    const prices = priceAll("enchanting", { [LESSER_ASTRAL]: 1, [GREATER_ASTRAL]: 3, [STRANGE_DUST]: 5 * GOLD, [SMALL_SHARD]: 5 * GOLD, [LESSER_MAGIC]: 5 * GOLD, [GREATER_MAGIC]: 15 * GOLD }, cloakChoices);
    const book = createPriceBook(prices, ctx.file, ctx.professionLabel);
    const route = cheapestRoute(ctx, 111, book, cloakChoices);
    expect(spellsBetween(route.entries, 111, 175)).toContain(CLOAK_MINOR_AGILITY);
    expectValid("enchanting", route.entries, 111, cloakChoices);
  });

  it("never picks a formula you haven't ticked", () => {
    const prices = priceAll("enchanting", { [LESSER_ASTRAL]: 1, [GREATER_ASTRAL]: 3, [STRANGE_DUST]: 5 * GOLD });
    const book = createPriceBook(prices, ctx.file, ctx.professionLabel);
    const route = cheapestRoute(ctx, 1, book, NO_CHOICES);
    const formulas = route.entries.filter((e) => e.kind === "craft" && e.source === "priced" && e.recipe.learn.source === "item");
    expect(formulas).toEqual([]);
    expectValid("enchanting", route.entries, 1, NO_CHOICES);
  });

  it("leaves out an unticked slot", () => {
    const choices: RouteChoices = { knownFormulas: new Set(), excludedSlots: new Set<EnchantSlot>(["2H Weapon"]) };
    // Shards nearly free would make 2H Weapon - Minor Impact the pick otherwise.
    const prices = priceAll("enchanting", { [SMALL_SHARD]: 0, [STRANGE_DUST]: 1 });
    const book = createPriceBook(prices, ctx.file, ctx.professionLabel);
    const withSlot = cheapestRoute(ctx, 100, book, NO_CHOICES);
    expect(withSlot.entries.some((e) => e.kind === "craft" && enchantSlot(e.recipe.name) === "2H Weapon")).toBe(true);
    const without = cheapestRoute(ctx, 100, book, choices);
    expect(without.entries.some((e) => e.kind === "craft" && e.source === "priced" && enchantSlot(e.recipe.name) === "2H Weapon")).toBe(false);
    expectValid("enchanting", without.entries, 100, choices);
  });

  it("falls back to the default rows where nothing is priced", () => {
    const book = createPriceBook({}, ctx.file, ctx.professionLabel);
    const route = cheapestRoute(ctx, 1, book, NO_CHOICES);
    expect(route.priced).toBe(false);
    expect(route.unknown).toBe(true);
    const crafts = route.entries.filter((e) => e.kind === "craft");
    expect(crafts.every((e) => e.kind === "craft" && e.source === "default" && (e.missing?.length ?? 0) > 0)).toBe(true);
    const handSpells = CRAFTING_ROUTES.enchanting.flatMap((s) => (s.kind === "craft" ? [s.spell] : []));
    expect(dedupe(spellsBetween(route.entries, 1, 300))).toEqual(dedupe(handSpells));
    expectValid("enchanting", route.entries, 1, NO_CHOICES);
  });

  it("keeps the rods at their hand-route skills", () => {
    const book = createPriceBook(priceAll("enchanting", {}), ctx.file, ctx.professionLabel);
    const route = cheapestRoute(ctx, 1, book, NO_CHOICES);
    const tools = new Set(ctx.file.recipes.flatMap((r) => (r.tool ? [r.tool.id] : [])));
    const handRods = CRAFTING_ROUTES.enchanting.filter(
      (s) => s.kind === "craft" && tools.has(ctx.recipes.get(s.spell)?.creates?.id ?? -1),
    );
    for (const rod of handRods) {
      expect(route.entries.some((e) => e.kind === "craft" && e.step.from === rod.from && e.step.to === rod.to && e.step.spell === (rod.kind === "craft" ? rod.spell : 0)), `rod at ${rod.from}`).toBe(true);
    }
    expect(handRods.length).toBeGreaterThan(0);
    expectValid("enchanting", route.entries, 1, NO_CHOICES);
  });

  it("is gapless and valid from any skill", () => {
    const book = createPriceBook(priceAll("enchanting", {}), ctx.file, ctx.professionLabel);
    for (const start of [1, 2, 55, 100, 101, 111, 175, 205, 250, 299]) {
      const route = cheapestRoute(ctx, start, book, NO_CHOICES);
      expectValid("enchanting", route.entries, start, NO_CHOICES);
      expect(route.unknown).toBe(false);
      expect(route.total).toBeGreaterThan(0);
      expect(route.reach).toBe(MAX_CRAFT_SKILL);
    }
  });

  it("totals only up to the first row without a cost, and says where that is", () => {
    // The player's own case: four prices entered at 117.
    const book = createPriceBook({ [STRANGE_DUST]: 8 * SILVER, [SMALL_SHARD]: 25 * SILVER, [LESSER_MAGIC]: 15 * SILVER, [LESSER_ASTRAL]: GOLD }, ctx.file, ctx.professionLabel);
    const route = cheapestRoute(ctx, 117, book, NO_CHOICES);
    const firstUnknown = route.entries.find((e) => e.step.to > 117 && (e.kind === "options" || e.cost === undefined));
    expect(route.unknown).toBe(true);
    expect(route.reach).toBe(firstUnknown?.step.from);
    const upTo = route.entries.filter((e) => e.kind === "craft" && e.step.to > 117 && e.step.to <= route.reach);
    expect(route.total).toBeCloseTo(upTo.reduce((sum, e) => sum + (e.kind === "craft" ? (e.cost ?? 0) : 0), 0));
  });
});

describe("cheapestRoute — Tailoring", () => {
  const ctx = context("tailoring");

  it("is gapless and valid, keeping the options row at the end", () => {
    const book = createPriceBook(priceAll("tailoring", {}), ctx.file, ctx.professionLabel);
    for (const start of [1, 50, 120, 210, 270]) {
      const route = cheapestRoute(ctx, start, book, NO_CHOICES);
      expectValid("tailoring", route.entries, start, NO_CHOICES);
      expect(route.entries[route.entries.length - 1].kind).toBe("options");
      expect(route.unknown).toBe(true);
    }
  });
});

describe("priceItems and formulaChoices", () => {
  it("lists raw materials only, in the order the default route first needs them", () => {
    const items = priceItems(context("tailoring"), 1, NO_CHOICES);
    expect(items.main.some((i) => i.id === BOLT_OF_LINEN)).toBe(false);
    expect(items.more.some((i) => i.id === BOLT_OF_LINEN)).toBe(false);
    expect(items.main[0].id).toBe(LINEN_CLOTH);
  });

  it("puts what you need next first — Strange Dust before the 300-skill dusts at Enchanting 117", () => {
    const ids = priceItems(context("enchanting"), 117, NO_CHOICES).main.map((i) => i.id);
    expect(ids.indexOf(STRANGE_DUST)).toBeLessThan(ids.indexOf(DREAM_DUST));
    // The two essences you're choosing between at 117 are both asked for up front.
    expect(ids).toContain(LESSER_MAGIC);
    expect(ids).toContain(LESSER_ASTRAL);
  });

  it("adds the other half of an essence pair", () => {
    const items = priceItems(context("enchanting"), 111, NO_CHOICES);
    const ids = new Set([...items.main, ...items.more].map((i) => i.id));
    expect(ids.has(GREATER_MAGIC)).toBe(true);
  });

  it("offers formulas near your skill, including the cloak one at 111", () => {
    const formulas = formulaChoices(context("enchanting"), 111, NO_CHOICES);
    expect(formulas.some((r) => r.spell === CLOAK_MINOR_AGILITY)).toBe(true);
    expect(formulas.every((r) => r.learn.source === "item" && r.grey > 112)).toBe(true);
  });
});
