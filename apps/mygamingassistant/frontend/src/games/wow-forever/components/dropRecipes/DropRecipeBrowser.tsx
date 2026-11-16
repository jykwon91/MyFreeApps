import { useSearchParams } from "react-router-dom";
import DropRecipeFilterBar from "@/games/wow-forever/components/dropRecipes/DropRecipeFilterBar";
import DropRecipeRow from "@/games/wow-forever/components/dropRecipes/DropRecipeRow";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import { DROP_RECIPE_PROFESSIONS, DROP_RECIPES_TEXT } from "@/games/wow-forever/data/dropRecipes/dropRecipesConfig";
import { dropRecipeFiltersFromParams, dropRecipeParams } from "@/games/wow-forever/lib/dropRecipes/dropRecipeParams";
import { dropRecipeProfessions, selectDropRecipes } from "@/games/wow-forever/lib/dropRecipes/selectDropRecipes";
import type { DropRecipe } from "@/games/wow-forever/types/dropRecipes/dropRecipe";
import type { DropRecipeFilters } from "@/games/wow-forever/types/dropRecipes/dropRecipeFilters";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface DropRecipeBrowserProps {
  recipes: readonly DropRecipe[];
  faction: PlayerFaction;
}

/** The filters (kept in the URL) and the matching recipes. */
export default function DropRecipeBrowser({ recipes, faction }: DropRecipeBrowserProps) {
  const [params, setParams] = useSearchParams();
  const filters = dropRecipeFiltersFromParams(params);
  const shown = selectDropRecipes(recipes, filters);
  const update = (next: DropRecipeFilters) => setParams(dropRecipeParams(next), { replace: true });
  return (
    <div className="space-y-4">
      <DropRecipeFilterBar professions={dropRecipeProfessions(recipes, DROP_RECIPE_PROFESSIONS)} filters={filters} onChange={update} />
      <p className="text-sm text-muted-foreground" data-testid="drop-recipe-count" aria-live="polite">
        {DROP_RECIPES_TEXT.count(shown.length)}
      </p>
      {shown.length ? (
        <ul className="space-y-2">
          {shown.map((recipe) => (
            <DropRecipeRow key={recipe.key} recipe={recipe} faction={faction} />
          ))}
        </ul>
      ) : (
        <EmptyStateNote message={DROP_RECIPES_TEXT.empty} />
      )}
    </div>
  );
}
