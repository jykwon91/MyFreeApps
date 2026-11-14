import { useId, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import RecipeProfessionToggle from "@/games/wow-forever/components/recipes/RecipeProfessionToggle";
import RecipeResults from "@/games/wow-forever/components/recipes/RecipeResults";
import ChoiceSelect from "@/games/wow-forever/components/shared/ChoiceSelect";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import {
  RECIPE_CATEGORIES,
  RECIPE_CATEGORY_LABELS,
  RECIPE_PARAMS,
  RECIPE_SEARCH_DELAY_MS,
  RECIPES_TEXT,
} from "@/games/wow-forever/data/recipes/recipesConfig";
import { useDebouncedSearchParam } from "@/games/wow-forever/hooks/useDebouncedSearchParam";
import { parseRecipeCategory, parseRecipeProfession, withRecipeParam } from "@/games/wow-forever/lib/recipes/recipeParams";
import { hasRecipeSearch, searchRecipes } from "@/games/wow-forever/lib/recipes/searchRecipes";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";
import type { RecipeFilters } from "@/games/wow-forever/types/recipes/recipeFilters";
import type { VendorPlace } from "@/games/wow-forever/types/recipeVendors/vendorPlace";

interface RecipeBrowserProps {
  entries: readonly RecipeEntry[];
  place: VendorPlace;
  zoneId: number | null;
  level: number | null;
}

/** The search box and filters (kept in the URL), and the recipes they pick. */
export default function RecipeBrowser({ entries, place, zoneId, level }: RecipeBrowserProps) {
  const [params, setParams] = useSearchParams();
  const search = useDebouncedSearchParam(RECIPE_PARAMS.query, RECIPE_SEARCH_DELAY_MS);
  const searchId = useId();
  const profession = parseRecipeProfession(params);
  const category = parseRecipeCategory(params);
  const filters: RecipeFilters = useMemo(() => ({ query: search.value, profession, category }), [search.value, profession, category]);
  const matches = useMemo(() => (hasRecipeSearch(filters) ? searchRecipes(entries, filters) : null), [entries, filters]);

  function setParam(key: string, value: string | undefined) {
    setParams((current) => withRecipeParam(current, key, value), { replace: true });
  }

  return (
    <div className="space-y-4" data-testid="recipe-browser">
      <div className="space-y-1">
        <label htmlFor={searchId} className="text-sm font-medium">
          {RECIPES_TEXT.searchLabel}
        </label>
        <input
          id={searchId}
          type="search"
          value={search.text}
          onChange={(e) => search.setText(e.target.value)}
          placeholder={RECIPES_TEXT.searchPlaceholder}
          className="min-h-[44px] w-full rounded-md border bg-card px-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          data-testid="recipe-search"
        />
      </div>
      <RecipeProfessionToggle value={profession} onChange={(next) => setParam(RECIPE_PARAMS.profession, next)} />
      <div className="sm:w-1/2">
        <ChoiceSelect
          id={`${searchId}-category`}
          label={RECIPES_TEXT.makesLabel}
          options={RECIPE_CATEGORIES}
          labels={RECIPE_CATEGORY_LABELS}
          value={category}
          onChange={(next) => setParam(RECIPE_PARAMS.category, next)}
          emptyLabel={RECIPES_TEXT.anything}
        />
      </div>
      {matches === null ? (
        <EmptyStateNote message={RECIPES_TEXT.prompt} />
      ) : (
        <RecipeResults key={`${filters.query}|${profession ?? ""}|${category ?? ""}`} matches={matches} place={place} zoneId={zoneId} level={level} />
      )}
    </div>
  );
}
