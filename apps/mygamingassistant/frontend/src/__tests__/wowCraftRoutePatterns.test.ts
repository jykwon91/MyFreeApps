import { describe, expect, it } from "vitest";
import tailoringJson from "@/games/wow-forever/data/professions/crafting/tailoring.json";
import trainerSkillsJson from "@/games/wow-forever/data/professions/crafting/classic/trainerSkills.json";
import {
  cheapestRoute,
  routePatterns,
  usable,
  withRoutePatterns,
  type CraftContext,
  type RouteChoices,
} from "@/games/wow-forever/crafting/cheapestRoute";
import { createPriceBook } from "@/games/wow-forever/crafting/matPrices";
import { CRAFTING_GUIDES } from "@/games/wow-forever/data/professions/crafting/craftingGuide";
import { CRAFTING_ROUTES } from "@/games/wow-forever/data/professions/crafting/craftingRoutes";
import { CRAFTING_RANKS } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import type { CraftingFile, CraftingProfession, ResolvedRouteEntry, TrainerSkills } from "@/games/wow-forever/types/crafting";

const file = tailoringJson as unknown as CraftingFile;
const ctx: CraftContext = {
  file,
  recipes: new Map(file.recipes.map((r) => [r.spell, r])),
  trainerSkills: (trainerSkillsJson as unknown as Record<CraftingProfession, TrainerSkills>).tailoring,
  route: CRAFTING_ROUTES.tailoring,
  ranks: CRAFTING_RANKS.tailoring,
  professionLabel: CRAFTING_GUIDES.tailoring.label,
};

const RUNECLOTH_CLOAK = 18409;
const RUNECLOTH_BOOTS = 18423;
const MOONCLOTH_BAG = 18560;
const RUNECLOTH = 14047;
const IRONWEB = 14227;
const RUNE_THREAD = 14341;
const RUGGED_LEATHER = 8170;
const SILVER = 100;

const ticked: RouteChoices = { knownFormulas: new Set(), excludedSlots: new Set() };

function spellAt(entries: readonly ResolvedRouteEntry[], skill: number): number | undefined {
  const row = entries.find((e) => e.kind === "craft" && e.step.from <= skill && skill < e.step.to);
  return row?.kind === "craft" ? row.step.spell : undefined;
}

function route(prices: Record<number, number>, choices: RouteChoices) {
  const book = createPriceBook(prices, file, ctx.professionLabel);
  return cheapestRoute(ctx, 225, book, choices);
}

describe("the route's own patterns", () => {
  const base = { [RUNECLOTH]: 50 * SILVER, [RUNE_THREAD]: 20 * SILVER };

  it("are the pattern recipes on the hand route's craft rows, not its options row", () => {
    const spells = routePatterns(ctx);
    expect(spells.has(RUNECLOTH_CLOAK)).toBe(true);
    expect(spells.has(RUNECLOTH_BOOTS)).toBe(true);
    expect(spells.has(MOONCLOTH_BAG)).toBe(false);
  });

  it("count as known without a tick; other patterns still need one", () => {
    const choices = withRoutePatterns(ctx, ticked);
    const recipe = (spell: number) => ctx.recipes.get(spell)!;
    expect(usable(recipe(RUNECLOTH_CLOAK), ticked)).toBe(false);
    expect(usable(recipe(RUNECLOTH_CLOAK), choices)).toBe(true);
    expect(usable(recipe(MOONCLOTH_BAG), choices)).toBe(false);
  });

  it("picks the Cloak while it is not green when Boots' leather is dear", () => {
    const prices = { ...base, [IRONWEB]: 1 * SILVER, [RUGGED_LEATHER]: 40 * SILVER };
    const result = route(prices, withRoutePatterns(ctx, ticked));
    expect(spellAt(result.entries, 240)).toBe(RUNECLOTH_CLOAK);
    expect(spellAt(result.entries, 235)).toBe(RUNECLOTH_CLOAK);
    expect(result.priced).toBe(true);
  });

  it("picks the Boots when Rugged Leather and Ironweb are cheap", () => {
    const prices = { ...base, [IRONWEB]: 1, [RUGGED_LEATHER]: 1 };
    const result = route(prices, withRoutePatterns(ctx, ticked));
    expect(spellAt(result.entries, 245)).toBe(RUNECLOTH_BOOTS);
  });

  it("never prices them without the rule", () => {
    const prices = { ...base, [IRONWEB]: 1 * SILVER, [RUGGED_LEATHER]: 40 * SILVER };
    const result = route(prices, ticked);
    const pricedCloak = result.entries.find((e) => e.kind === "craft" && e.step.spell === RUNECLOTH_CLOAK && e.source === "priced");
    expect(pricedCloak).toBeUndefined();
  });
});
