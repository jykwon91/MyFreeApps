/**
 * What the prices panel asks about: the materials worth pricing and the formulas
 * worth ticking, for a profession from your skill on.
 */
import { learnAt, learnSkill, mustAcquire, resolveRoute, skillColors } from "@/games/wow-forever/crafting/craftRoute";
import { usable, type CraftContext, type RouteChoices } from "@/games/wow-forever/crafting/cheapestRoute";
import { essencePartner } from "@/games/wow-forever/crafting/matPrices";
import { makerOf, shoppingList } from "@/games/wow-forever/crafting/shoppingList";
import type { CraftRecipe } from "@/games/wow-forever/types/crafting";

/** Formula checklist: formulas you can learn within this many points of your skill (plus any you've ticked). */
export const FORMULA_WINDOW = 50;

/** Price list: recipes you can use within this many points of your skill put their materials on the main list. */
export const SOON_WINDOW = 30;

/** One material on the price list. */
export interface PriceItem {
  id: number;
  name: string;
  /** How many the default route still needs from your skill (0 = only other recipes use it). */
  need: number;
}

const UNNAMED_ITEM = /^Item \d+$/;

/** Recipes that could still give you points from `start` on. */
function candidatesFrom(ctx: CraftContext, start: number, choices: RouteChoices): CraftRecipe[] {
  return ctx.file.recipes.filter((r) => usable(r, choices) && r.grey > start + 1);
}

/**
 * The raw materials worth pricing from `start` on. `main` = what the default
 * route needs, in the order it first needs them (what you buy next comes
 * first, not the 300-skill dusts); `more` = what only other recipes use (and the
 * other half of an essence pair). The order depends only on the route and
 * your skill, never on prices — so the list doesn't jump while you type.
 */
export function priceItems(ctx: CraftContext, start: number, choices: RouteChoices): { main: PriceItem[]; more: PriceItem[] } {
  const defaults = resolveRoute(ctx.route, ctx.recipes, ctx.trainerSkills);
  const buy = shoppingList(defaults, start, ctx.file, ctx.professionLabel).buy;
  const main = buy.map((l) => ({ id: l.id, name: l.name, need: l.count }));
  const seen = new Set(main.map((m) => m.id));
  const more = new Map<number, PriceItem>();

  const ownMade = (id: number) => ctx.file.madeBy[String(id)] === ctx.professionLabel;
  function addRaw(into: Map<number, PriceItem>, id: number, name: string, depth: number): void {
    if (ownMade(id) && depth < 3) {
      const maker = makerOf(id, ctx.file.recipes);
      if (maker) {
        for (const r of maker.reagents) addRaw(into, r.id, r.name, depth + 1);
        return;
      }
    }
    // "Item 234003": a Forever item the data has no name for — nobody can look that up on the auction house.
    if (UNNAMED_ITEM.test(name) || seen.has(id) || soon.has(id) || more.has(id)) return;
    into.set(id, { id, name, need: 0 });
  }
  // What the next stretch's other recipes use goes on the main list too: the
  // choice you're making right now (Lesser Magic vs Lesser Astral Essence at
  // 117) needs both prices, not just the default route's.
  const soon = new Map<number, PriceItem>();
  const candidates = candidatesFrom(ctx, start, choices);
  const isSoon = (r: CraftRecipe) => learnSkill(learnAt(r, ctx.trainerSkills)) < start + SOON_WINDOW && skillColors(r).green > start;
  // Near recipes first, so an item both a near and a later recipe use lands on the main list.
  for (const recipe of candidates.filter(isSoon)) for (const r of recipe.reagents) addRaw(soon, r.id, r.name, 0);
  for (const recipe of candidates) for (const r of recipe.reagents) addRaw(more, r.id, r.name, 0);
  main.push(...soon.values());
  for (const id of soon.keys()) seen.add(id);

  // 3 Lesser = 1 Greater, so a price for either half helps.
  for (const item of [...main, ...more.values()]) {
    const partner = essencePartner(item.id);
    if (!partner || seen.has(partner.id) || more.has(partner.id)) continue;
    const name = nameOf(ctx.file.recipes, partner.id);
    if (name) more.set(partner.id, { id: partner.id, name, need: 0 });
  }
  return { main, more: [...more.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

function nameOf(recipes: readonly CraftRecipe[], itemId: number): string | null {
  for (const recipe of recipes) {
    const reagent = recipe.reagents.find((r) => r.id === itemId);
    if (reagent) return reagent.name;
  }
  return null;
}

/**
 * Formulas worth asking about: learnable within FORMULA_WINDOW points of
 * your skill and still giving points, plus any you've already ticked. The
 * whole catalogue (hundreds of patterns) would bury the useful few.
 */
export function formulaChoices(ctx: CraftContext, start: number, choices: RouteChoices): CraftRecipe[] {
  return ctx.file.recipes
    .filter(mustAcquire)
    .map((r) => ({ recipe: r, skill: learnSkill(learnAt(r, ctx.trainerSkills)) }))
    .filter(({ recipe: r, skill }) => r.grey > start + 1 && (skill < start + FORMULA_WINDOW || choices.knownFormulas.has(r.spell)))
    .filter(({ recipe: r }) => usable(r, { ...choices, knownFormulas: new Set([r.spell]) }))
    .sort((a, b) => a.skill - b.skill || a.recipe.name.localeCompare(b.recipe.name))
    .map(({ recipe }) => recipe);
}
