/** What a recipe's made item sells for on one house: the one notion of "its auction value" the craft-profit pages and the Most profit route share. Pure. */
import { MIN_PRODUCT_LISTINGS } from "@/games/wow-forever/data/auctionHouse/reagentDemandRules";
import type { RecipeSale } from "@/games/wow-forever/types/auctionHouse/recipeSale";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { CraftRecipe } from "@/games/wow-forever/types/crafting";

/** The made item's price, when it sells here: an item (not an enchant) with enough listings that one odd one can't set its price. */
export function listedProduct(recipe: CraftRecipe, byId: ReadonlyMap<number, AuctionPrice>): AuctionPrice | null {
  if (!recipe.creates || recipe.enchant) return null;
  const product = byId.get(recipe.creates.id);
  return product && product.listings >= MIN_PRODUCT_LISTINGS ? product : null;
}

/** Copper `count` of the product bring in after the house's cut. */
export function saleAfterCut(product: AuctionPrice, count: number, cut: number): number {
  return Math.floor(product.marketValue * count * (1 - cut));
}

/** One craft's sale: what it brings in after the cut, or why it brings in nothing (no price, or a thin market). */
export function recipeSale(recipe: CraftRecipe, byId: ReadonlyMap<number, AuctionPrice>, cut: number): RecipeSale {
  const priced = recipe.creates && !recipe.enchant ? byId.get(recipe.creates.id) : undefined;
  const product = listedProduct(recipe, byId);
  if (!recipe.creates || !product) return { sells: 0, gap: priced ? "thin" : "none", onSale: priced?.quantity ?? 0 };
  return { sells: saleAfterCut(product, recipe.creates.count, cut), gap: null, onSale: product.quantity };
}

/** Every recipe's sale on a house, by spell. */
export function recipeSales(recipes: readonly CraftRecipe[], byId: ReadonlyMap<number, AuctionPrice>, cut: number): ReadonlyMap<number, RecipeSale> {
  return new Map(recipes.map((recipe) => [recipe.spell, recipeSale(recipe, byId, cut)]));
}
