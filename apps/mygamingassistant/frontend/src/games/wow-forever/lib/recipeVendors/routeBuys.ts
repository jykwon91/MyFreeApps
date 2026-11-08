import type { RouteStep } from "@/games/wow-forever/data/professions/professionTypes";
import type { FoodRecord } from "@/games/wow-forever/types/food";
import type { RecipeBuy } from "@/games/wow-forever/types/recipeVendors/recipeBuy";
import type { RouteBuyPlace } from "@/games/wow-forever/types/recipeVendors/routeBuyPlace";

/** What a hand-written route row has you buy: its recipes (by food id), or the rank's book on a "Buy the book" milestone. */
export function routeBuys(step: RouteStep, buy: Pick<RouteBuyPlace, "sources" | "book">): RecipeBuy[] {
  if (step.kind === "milestone") {
    return step.buysBook && buy.book ? [{ itemId: buy.book.itemId, name: buy.book.name, sources: buy.book.sources }] : [];
  }
  return (step.recipes ?? []).map((r) => ({ itemId: r.id, name: r.name, sources: buy.sources.recipe(r.id) }));
}

/** The recipe items a route has you buy (its rows name foods) — to mark them "On your route" in the vendor list. */
export function routeRecipeItems(steps: readonly RouteStep[], foods: readonly FoodRecord[]): Set<number> {
  const routeFoods = new Set(steps.flatMap((s) => (s.kind === "craft" ? (s.recipes ?? []).map((r) => r.id) : [])));
  return new Set(foods.flatMap((f) => (routeFoods.has(f.id) && f.learn.recipeItem !== null ? [f.learn.recipeItem] : [])));
}
