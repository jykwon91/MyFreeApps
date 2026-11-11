/** A crafting profession's materials and recipes, priced on one auction house. Pure. */
import { recipeIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { searchAuctionItems, SEARCH_LIMIT } from "@/games/wow-forever/prices/auctionSearch";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { ProfessionMaterialsResult } from "@/games/wow-forever/types/auctionHouse/professionMaterialsResult";
import type { RecipeOption } from "@/games/wow-forever/types/auctionHouse/recipeOption";
import type { RecipePriceBreakdown } from "@/games/wow-forever/types/auctionHouse/recipePriceBreakdown";
import type { AuctionSort } from "@/games/wow-forever/types/auctionSort";
import type { CraftRecipe } from "@/games/wow-forever/types/crafting";

/** Every reagent any of the recipes uses: item id -> name. */
export function professionMaterials(recipes: Iterable<CraftRecipe>): Map<number, string> {
  const materials = new Map<number, string>();
  for (const recipe of recipes) {
    for (const reagent of recipe.reagents) materials.set(reagent.id, reagent.name);
  }
  return materials;
}

/** The materials on sale on this house that match the search, plus how many matching ones aren't on sale. */
export function searchProfessionMaterials(
  materials: ReadonlyMap<number, string>,
  byId: ReadonlyMap<number, AuctionPrice>,
  query: string,
  sort: AuctionSort,
): ProfessionMaterialsResult {
  const needle = query.trim().toLowerCase();
  const onSale: AuctionPrice[] = [];
  let notOnSale = 0;
  for (const [id, name] of materials) {
    const price = byId.get(id);
    if (price) onSale.push(price);
    else if (!needle || name.toLowerCase().includes(needle) || String(id) === needle) notOnSale += 1;
  }
  // A profession's materials are a short list: up to the search cap, typed or not.
  return { ...searchAuctionItems(onSale, query, sort, SEARCH_LIMIT), notOnSale };
}

/** The recipes, lowest skill first (then by name), labelled with that skill. */
export function recipeOptions(recipes: Iterable<CraftRecipe>): RecipeOption[] {
  return [...recipes]
    .sort((a, b) => a.yellow - b.yellow || a.name.localeCompare(b.name) || a.spell - b.spell)
    .map((r) => ({ spell: r.spell, label: `${r.name} (${r.yellow})`, icon: recipeIcon(r) }));
}

/** One craft's materials at this house's market values, and the made item's price. */
export function recipePriceBreakdown(recipe: CraftRecipe, byId: ReadonlyMap<number, AuctionPrice>): RecipePriceBreakdown {
  const lines = recipe.reagents.map((reagent) => {
    const price = byId.get(reagent.id) ?? null;
    return { itemId: reagent.id, name: reagent.name, count: reagent.count, price, cost: price ? price.marketValue * reagent.count : null };
  });
  const product = recipe.creates
    ? { itemId: recipe.creates.id, name: recipe.creates.name, count: recipe.creates.count, price: byId.get(recipe.creates.id) ?? null }
    : null;
  return {
    lines,
    materialsCost: lines.reduce((sum, line) => sum + (line.cost ?? 0), 0),
    unpriced: lines.filter((line) => line.cost === null).length,
    product,
  };
}

/** How many recipe matches the picker lists at once. */
export const RECIPE_MATCH_LIMIT = 8;

/** Recipes whose name has every typed word, in any order; nothing typed = none. */
export function findRecipes(options: readonly RecipeOption[], query: string): RecipeOption[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return options.filter((o) => words.every((w) => o.label.toLowerCase().includes(w))).slice(0, RECIPE_MATCH_LIMIT);
}

/** Profit per craft before the auction house's cut: null unless every material and the made item have a price. */
export function craftProfit(breakdown: RecipePriceBreakdown): number | null {
  const sells = breakdown.product?.price;
  if (!sells || breakdown.unpriced > 0) return null;
  return sells.marketValue * (breakdown.product?.count ?? 1) - breakdown.materialsCost;
}
