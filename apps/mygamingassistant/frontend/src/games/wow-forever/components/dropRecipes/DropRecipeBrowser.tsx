import { useSearchParams } from "react-router-dom";
import CharacterLookupForm from "@/games/wow-forever/components/character/CharacterLookupForm";
import DropRecipeFilterBar from "@/games/wow-forever/components/dropRecipes/DropRecipeFilterBar";
import DropRecipeKnownNote from "@/games/wow-forever/components/dropRecipes/DropRecipeKnownNote";
import DropRecipeRow from "@/games/wow-forever/components/dropRecipes/DropRecipeRow";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import { DROP_RECIPE_PROFESSIONS, DROP_RECIPES_TEXT } from "@/games/wow-forever/data/dropRecipes/dropRecipesConfig";
import { useKnownDropRecipes } from "@/games/wow-forever/hooks/useKnownDropRecipes";
import { useRecentCharacters } from "@/games/wow-forever/hooks/useRecentCharacters";
import { dropRecipeFiltersFromParams, dropRecipeParams } from "@/games/wow-forever/lib/dropRecipes/dropRecipeParams";
import { dropRecipeProfessions, selectDropRecipes } from "@/games/wow-forever/lib/dropRecipes/selectDropRecipes";
import type { DropRecipe } from "@/games/wow-forever/types/dropRecipes/dropRecipe";
import type { DropRecipeFilters } from "@/games/wow-forever/types/dropRecipes/dropRecipeFilters";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface DropRecipeBrowserProps {
  recipes: readonly DropRecipe[];
  faction: PlayerFaction;
}

/** The filters and the picked character (kept in the URL), and the matching recipes, the ones that character knows crossed out. */
export default function DropRecipeBrowser({ recipes, faction }: DropRecipeBrowserProps) {
  const [params, setParams] = useSearchParams();
  const [recent, remember] = useRecentCharacters();
  const filters = dropRecipeFiltersFromParams(params);
  const known = useKnownDropRecipes(filters.character, filters.profession, remember);
  const shown = selectDropRecipes(recipes, filters);
  const knownSpells = known.kind === "ready" ? known.mine.knownSpells : null;
  const knownCount = knownSpells ? shown.filter((r) => knownSpells.has(r.spell)).length : 0;
  const update = (next: DropRecipeFilters) => setParams(dropRecipeParams(next), { replace: true });
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <CharacterLookupForm
          recent={recent}
          currentSlug={filters.character}
          busy={known.kind === "loading"}
          onLookup={(character) => update({ ...filters, character })}
          note={DROP_RECIPES_TEXT.characterNote}
        />
        <div aria-live="polite">
          <DropRecipeKnownNote state={known} profession={filters.profession} onShowAll={() => update({ ...filters, character: null })} />
        </div>
      </div>
      <DropRecipeFilterBar professions={dropRecipeProfessions(recipes, DROP_RECIPE_PROFESSIONS)} filters={filters} onChange={update} />
      <p className="text-sm text-muted-foreground" data-testid="drop-recipe-count" aria-live="polite">
        {known.kind === "ready" && knownCount > 0
          ? DROP_RECIPES_TEXT.countKnown(shown.length, knownCount, known.mine.characterName)
          : DROP_RECIPES_TEXT.count(shown.length)}
      </p>
      {shown.length ? (
        <ul className="space-y-2">
          {shown.map((recipe) => (
            <DropRecipeRow key={recipe.key} recipe={recipe} faction={faction} known={knownSpells?.has(recipe.spell) ?? false} />
          ))}
        </ul>
      ) : (
        <EmptyStateNote message={DROP_RECIPES_TEXT.empty} />
      )}
    </div>
  );
}
