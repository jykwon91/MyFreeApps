import type { SourceLookup } from "@/games/wow-forever/data/sourceDecode";
import type { CraftRecipe, ResolvedRouteEntry } from "@/games/wow-forever/types/crafting";
import type { FoodRecord } from "@/games/wow-forever/types/food";
import type { ItemSources, RankBook } from "@/games/wow-forever/types/recipeSources";
import type { VendorRecipe } from "@/games/wow-forever/types/recipeVendors/vendorRecipe";

function vendorRecipe(itemId: number, name: string, skill: number | null, sources: ItemSources): VendorRecipe | null {
  if (sources.vendors.length === 0) return null;
  return { itemId, name, skill, price: sources.price, onRoute: false, vendors: sources.vendors };
}

function present<T>(value: T | null): value is T {
  return value !== null;
}

/** The teaching items (Pattern / Formula / Plans…) the shown route has you learn. */
export function routeTeachingItems(entries: readonly ResolvedRouteEntry[]): Set<number> {
  const recipes = entries.flatMap((e) => (e.kind === "craft" ? [e.recipe] : e.recipes));
  return new Set(recipes.flatMap((r) => (r.learn.source === "item" ? [r.learn.itemId] : [])));
}

/** Mark the recipes whose item is on the route (a rank's book always is — the cap won't rise without it). */
export function withRoute(recipes: readonly VendorRecipe[], onRoute: ReadonlySet<number>, books: ReadonlySet<number> = new Set()): VendorRecipe[] {
  return recipes.map((r) => ({ ...r, onRoute: onRoute.has(r.itemId) || books.has(r.itemId) }));
}

/** Every recipe of a crafting profession that a vendor sells, by its teaching item (keyed in `sources.json`). */
export function craftVendorRecipes(recipes: readonly CraftRecipe[], sources: SourceLookup): VendorRecipe[] {
  const seen = new Set<number>();
  return recipes
    .map((r) => {
      if (r.learn.source !== "item" || seen.has(r.learn.itemId)) return null;
      seen.add(r.learn.itemId);
      const { itemId, item, skill } = r.learn;
      return vendorRecipe(itemId, item, skill, sources.recipe(itemId));
    })
    .filter(present);
}

/** Every Cooking recipe a vendor sells, by its recipe item (food sources are keyed by the food's id). */
export function cookingVendorRecipes(foods: readonly FoodRecord[], sources: SourceLookup): VendorRecipe[] {
  return foods
    .map((f) => {
      const { recipe, recipeItem, skill } = f.learn;
      if (recipe === null || recipeItem === null) return null;
      return vendorRecipe(recipeItem, recipe, skill, sources.recipe(f.id));
    })
    .filter(present);
}

/** A rank's book (Expert Cookbook) as a vendor recipe, when a vendor sells it. */
export function bookRecipes(book: RankBook | null): VendorRecipe[] {
  const recipe = book ? vendorRecipe(book.itemId, book.name, null, book.sources) : null;
  return recipe ? [recipe] : [];
}
