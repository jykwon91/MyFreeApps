/** Which materials crafting puts pressure on: leveling routes that use them, crafts that pay on a house, and the most valuable products they go into there. Pure. */
import { AUCTION_MATERIAL_PROFESSIONS } from "@/games/wow-forever/data/auctionHouse/auctionMaterialProfessions";
import {
  MAX_LEVELING_PROFESSIONS,
  MAX_RECIPE_PROFESSIONS,
  MIN_CRAFT_MARGIN,
  MIN_CRAFT_PROFIT_COPPER,
  MIN_PRODUCT_LISTINGS,
} from "@/games/wow-forever/data/auctionHouse/reagentDemandRules";
import { CRAFTING_ROUTES } from "@/games/wow-forever/data/professions/crafting/craftingRoutes";
import type { CraftingByProfession } from "@/games/wow-forever/types/auctionHouse/craftingByProfession";
import type { CraftPays } from "@/games/wow-forever/types/auctionHouse/craftPays";
import type { ReagentWant } from "@/games/wow-forever/types/auctionHouse/reagentWant";
import type { ReagentDemand } from "@/games/wow-forever/types/auctionHouse/reagentDemand";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { CraftingProfession, CraftRecipe, CraftRouteEntry } from "@/games/wow-forever/types/crafting";
import type { CraftingData } from "@/games/wow-forever/types/craftingData";

type Range = readonly [number, number];

const LABEL = new Map<CraftingProfession, string>(AUCTION_MATERIAL_PROFESSIONS.map((p) => [p.id, p.label]));

function labelOf(profession: CraftingProfession): string {
  return LABEL.get(profession) ?? profession;
}

/** "A, B +2 more". */
function nameList(names: readonly string[], max: number): string {
  const shown = names.slice(0, max).join(", ");
  return names.length > max ? `${shown} +${names.length - max} more` : shown;
}

/** The whole skill span a profession's route needs it for: [1,25],[60,70] -> "1–70" (short enough for a tooltip). */
function spanText(ranges: readonly Range[]): string {
  return `${Math.min(...ranges.map((r) => r[0]))}–${Math.max(...ranges.map((r) => r[1]))}`;
}

/** Each route row's recipe spells with the skill range it covers ("options" rows: every option). */
function routeSpells(route: readonly CraftRouteEntry[]): { spell: number; range: Range }[] {
  return route.flatMap((entry) =>
    entry.kind === "craft"
      ? [{ spell: entry.spell, range: [entry.from, entry.to] as const }]
      : entry.options.map((o) => ({ spell: o.spell, range: [entry.from, entry.to] as const })),
  );
}

/** A route recipe's materials, plus what goes into the ones the profession makes itself (Linen Cloth for Bolts of Linen). */
function routeMaterials(recipe: CraftRecipe, makers: ReadonlyMap<number, CraftRecipe>): number[] {
  const ids = recipe.reagents.map((r) => r.id);
  for (const reagent of recipe.reagents) {
    for (const inner of makers.get(reagent.id)?.reagents ?? []) ids.push(inner.id);
  }
  return ids;
}

function makersOf(data: CraftingData): Map<number, CraftRecipe> {
  const makers = new Map<number, CraftRecipe>();
  for (const recipe of [...data.file.recipes, ...(data.file.smelting ?? [])]) {
    if (recipe.creates && !makers.has(recipe.creates.id)) makers.set(recipe.creates.id, recipe);
  }
  return makers;
}

/** Profession names, the one with the most recipes using the material first. */
function mostRecipesFirst(counts: ReadonlyMap<string, number> | undefined): string[] {
  return [...(counts ?? [])].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label]) => label);
}

/** True when some vendor always has it in stock. */
function soldByVendors(data: CraftingData, itemId: number): boolean {
  return data.sources.reagent(itemId).vendors.some((v) => !v.limited);
}

/** Every material any recipe uses: whether vendors sell it, the leveling routes that need it, and how many recipes use it. */
export function reagentDemand(crafting: CraftingByProfession): Map<number, ReagentDemand> {
  const leveling = new Map<number, Map<string, Range[]>>();
  const recipes = new Map<number, number>();
  const professions = new Map<number, Map<string, number>>();
  const vendor = new Map<number, boolean>();

  for (const [profession, data] of crafting) {
    const label = labelOf(profession);
    for (const recipe of data.file.recipes) {
      for (const { id } of recipe.reagents) {
        recipes.set(id, (recipes.get(id) ?? 0) + 1);
        const byLabel = professions.get(id) ?? new Map<string, number>();
        byLabel.set(label, (byLabel.get(label) ?? 0) + 1);
        professions.set(id, byLabel);
        if (!vendor.has(id)) vendor.set(id, soldByVendors(data, id));
      }
    }
    const makers = makersOf(data);
    for (const { spell, range } of routeSpells(CRAFTING_ROUTES[profession])) {
      const recipe = data.recipes.get(spell);
      if (!recipe) continue;
      for (const id of new Set(routeMaterials(recipe, makers))) {
        const byLabel = leveling.get(id) ?? new Map<string, Range[]>();
        byLabel.set(label, [...(byLabel.get(label) ?? []), range]);
        leveling.set(id, byLabel);
        if (!vendor.has(id)) vendor.set(id, soldByVendors(data, id));
      }
    }
  }

  const demand = new Map<number, ReagentDemand>();
  for (const [id, isVendor] of vendor) {
    const routes = [...(leveling.get(id) ?? new Map<string, Range[]>())]
      .map(([label, ranges]) => ({ label, ranges, start: Math.min(...ranges.map((r) => r[0])) }))
      .sort((a, b) => a.start - b.start || a.label.localeCompare(b.label))
      .map((r) => `${r.label} ${spanText(r.ranges)}`);
    demand.set(id, {
      vendor: isVendor,
      leveling: nameList(routes, MAX_LEVELING_PROFESSIONS),
      recipes: recipes.get(id) ?? 0,
      professions: nameList(mostRecipesFirst(professions.get(id)), MAX_RECIPE_PROFESSIONS),
    });
  }
  return demand;
}

/** A recipe most crafters can get: trainers, starting recipes, and recipes a vendor sells (not rare drops). */
function widelyKnown(recipe: CraftRecipe, data: CraftingData): boolean {
  return recipe.learn.source !== "item" || data.sources.recipe(recipe.learn.itemId).vendors.some((v) => !v.limited);
}

/** What one unit costs a crafter: its market value, or a vendor's price when that's cheaper; null when neither exists. */
function unitCost(id: number, data: CraftingData, byId: ReadonlyMap<number, AuctionPrice>): number | null {
  const market = byId.get(id)?.marketValue ?? null;
  const sources = data.sources.reagent(id);
  const vendorPrice = sources.price !== null && sources.vendors.some((v) => !v.limited) ? sources.price : null;
  if (market === null) return vendorPrice;
  return vendorPrice === null ? market : Math.min(market, vendorPrice);
}

/** Copper one craft makes on this house after its cut, or null when it doesn't clearly pay. */
function craftProfit(recipe: CraftRecipe, data: CraftingData, byId: ReadonlyMap<number, AuctionPrice>, cut: number): number | null {
  if (!recipe.creates || recipe.enchant || !widelyKnown(recipe, data)) return null;
  const product = byId.get(recipe.creates.id);
  if (!product || product.listings < MIN_PRODUCT_LISTINGS) return null;
  let cost = 0;
  for (const reagent of recipe.reagents) {
    const each = unitCost(reagent.id, data, byId);
    if (each === null) return null;
    cost += each * reagent.count;
  }
  const profit = Math.floor(product.marketValue * recipe.creates.count * (1 - cut)) - cost;
  return profit >= MIN_CRAFT_PROFIT_COPPER && profit >= cost * MIN_CRAFT_MARGIN ? profit : null;
}

/** Each material's best-paying craft on one house (vendor-sold materials left out: crafting can't raise their price). */
export function craftsThatPay(crafting: CraftingByProfession, byId: ReadonlyMap<number, AuctionPrice>, cut: number): Map<number, CraftPays> {
  const best = new Map<number, CraftPays>();
  for (const data of crafting.values()) {
    for (const recipe of data.file.recipes) {
      const profit = craftProfit(recipe, data, byId, cut);
      if (profit === null) continue;
      for (const { id } of recipe.reagents) {
        if (soldByVendors(data, id)) continue;
        const current = best.get(id);
        if (!current || profit > current.profit) best.set(id, { recipe: recipe.name, profit });
      }
    }
  }
  return best;
}

/**
 * Each material's most valuable product on one house: the recipe whose made items sell for the most per craft,
 * rare patterns included (their crafters buy too). That demand is what holds a material's price up, even once
 * its price has risen so far that the craft no longer pays. Vendor-sold materials are left out, and so is a
 * product that sells for no more than the material it uses.
 */
export function mostWantedFor(crafting: CraftingByProfession, byId: ReadonlyMap<number, AuctionPrice>): Map<number, ReagentWant> {
  const best = new Map<number, ReagentWant>();
  for (const data of crafting.values()) {
    for (const recipe of data.file.recipes) {
      const product = recipe.creates && !recipe.enchant ? byId.get(recipe.creates.id) : undefined;
      if (!recipe.creates || !product || product.listings < MIN_PRODUCT_LISTINGS) continue;
      const sells = product.marketValue * recipe.creates.count;
      for (const reagent of recipe.reagents) {
        if (soldByVendors(data, reagent.id)) continue;
        // A product worth less than the material it eats (Essence of Air into Fire) isn't what holds that price up.
        if (sells <= (byId.get(reagent.id)?.marketValue ?? 0) * reagent.count) continue;
        const current = best.get(reagent.id);
        if (!current || sells > current.sells) best.set(reagent.id, { recipe: recipe.name, count: reagent.count, sells });
      }
    }
  }
  return best;
}
