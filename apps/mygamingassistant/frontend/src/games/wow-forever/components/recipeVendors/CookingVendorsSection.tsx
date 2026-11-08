import { useMemo } from "react";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import RecipeVendorsSection from "@/games/wow-forever/components/recipeVendors/RecipeVendorsSection";
import RecipeVendorsSkeleton from "@/games/wow-forever/components/recipeVendors/RecipeVendorsSkeleton";
import { COOKING_ROUTE } from "@/games/wow-forever/data/professions/cooking";
import { RECIPE_VENDOR_TEXT } from "@/games/wow-forever/data/recipeVendors/recipeVendorText";
import { useFoods } from "@/games/wow-forever/hooks/useFoods";
import { bookRecipes, cookingVendorRecipes, withRoute } from "@/games/wow-forever/lib/recipeVendors/collectVendorRecipes";
import { routeRecipeItems } from "@/games/wow-forever/lib/recipeVendors/routeBuys";
import type { SourceLookup } from "@/games/wow-forever/data/sourceDecode";
import type { RankBook } from "@/games/wow-forever/types/recipeSources";
import type { VendorPlace } from "@/games/wow-forever/types/recipeVendors/vendorPlace";
import type { VendorRecipe } from "@/games/wow-forever/types/recipeVendors/vendorRecipe";

interface CookingVendorsSectionProps {
  sources: SourceLookup;
  book: RankBook | null;
  place: VendorPlace;
}

/** Cooking's "Recipe vendors": the Expert Cookbook and every recipe a vendor sells, once the food list loads. */
export default function CookingVendorsSection({ sources, book, place }: CookingVendorsSectionProps) {
  const state = useFoods();
  const foods = state.status === "ready" ? state.foods : null;
  const recipes = useMemo((): VendorRecipe[] | null => {
    if (!foods) return null;
    const books = new Set(book ? [book.itemId] : []);
    return withRoute([...bookRecipes(book), ...cookingVendorRecipes(foods, sources)], routeRecipeItems(COOKING_ROUTE, foods), books);
  }, [foods, sources, book]);
  const fallback =
    state.status === "error" ? (
      <LoadErrorRetry message={RECIPE_VENDOR_TEXT.cookingLoadError} onRetry={state.retry} retrying={state.retrying} />
    ) : (
      <RecipeVendorsSkeleton />
    );
  return <RecipeVendorsSection recipes={recipes} place={place} fallback={fallback} />;
}
