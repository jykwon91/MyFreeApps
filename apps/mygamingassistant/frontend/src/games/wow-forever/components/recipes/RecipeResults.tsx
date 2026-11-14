import { useState } from "react";
import RecipeRow from "@/games/wow-forever/components/recipes/RecipeRow";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import { RECIPE_PAGE_SIZE, RECIPES_TEXT } from "@/games/wow-forever/data/recipes/recipesConfig";
import type { RecipeMatch } from "@/games/wow-forever/types/recipes/recipeMatch";
import type { VendorPlace } from "@/games/wow-forever/types/recipeVendors/vendorPlace";

interface RecipeResultsProps {
  matches: readonly RecipeMatch[];
  place: VendorPlace;
  zoneId: number | null;
  level: number | null;
}

/** The matching recipes, a page at a time. The page keys it by the search, so a new search starts at the first page. */
export default function RecipeResults({ matches, place, zoneId, level }: RecipeResultsProps) {
  const [shown, setShown] = useState(RECIPE_PAGE_SIZE);
  if (matches.length === 0) return <EmptyStateNote message={RECIPES_TEXT.noMatch} />;
  const visible = Math.min(shown, matches.length);
  const more = matches.length - visible;
  return (
    <div className="space-y-3">
      <ul className="space-y-2" aria-label="Recipes">
        {matches.slice(0, visible).map((m) => (
          <RecipeRow key={m.entry.key} match={m} place={place} zoneId={zoneId} level={level} />
        ))}
      </ul>
      {more > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShown((n) => n + RECIPE_PAGE_SIZE)}
            className="min-h-[44px] w-full rounded-md border bg-card px-4 text-sm font-medium hover:bg-muted sm:w-auto"
            data-testid="recipe-more"
          >
            Show {Math.min(RECIPE_PAGE_SIZE, more)} more
          </button>
          <span className="text-xs text-muted-foreground">
            Showing {visible.toLocaleString()} of {matches.length.toLocaleString()}
          </span>
        </div>
      ) : null}
    </div>
  );
}
