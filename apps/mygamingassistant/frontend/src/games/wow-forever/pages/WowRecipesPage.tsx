import { useSearchParams } from "react-router-dom";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import RecipeBrowser from "@/games/wow-forever/components/recipes/RecipeBrowser";
import RecipesSkeleton from "@/games/wow-forever/components/recipes/RecipesSkeleton";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { PLAYER_FACTION_OPTIONS } from "@/games/wow-forever/data/playerFactionOptions";
import { RECIPES_TEXT } from "@/games/wow-forever/data/recipes/recipesConfig";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { useRecipeBook } from "@/games/wow-forever/hooks/useRecipeBook";
import { useVendorPlace } from "@/games/wow-forever/hooks/useVendorPlace";
import { recipeFiltersFromParams } from "@/games/wow-forever/lib/recipes/recipeParams";
import { hasRecipeSearch } from "@/games/wow-forever/lib/recipes/searchRecipes";

/** /wow-forever/recipes — every recipe from every profession: search it, see what goes in and where to learn it. */
export default function WowRecipesPage() {
  useDocumentTitle("Recipes · WoW Forever");
  const state = useRecipeBook();
  const [player, updatePlayer] = usePlayerSettings();
  const place = useVendorPlace(player.faction, player.zoneId, player.position);
  const [params] = useSearchParams();
  return (
    <div className="p-4 sm:p-8 space-y-4 max-w-4xl">
      <WowPageHeader title="Recipes" subtitle={RECIPES_TEXT.subtitle} backTo="/wow-forever" backLabel="Back to WoW Forever" />
      <SegmentedToggle label="Faction" options={PLAYER_FACTION_OPTIONS} value={player.faction} onChange={(faction) => updatePlayer({ faction })} />
      {state.status === LOAD_STATUS.error ? <LoadErrorRetry message={RECIPES_TEXT.loadError} onRetry={state.retry} retrying={false} /> : null}
      {state.status === LOAD_STATUS.loading ? <RecipesSkeleton listing={hasRecipeSearch(recipeFiltersFromParams(params))} /> : null}
      {state.status === LOAD_STATUS.ready ? <RecipeBrowser entries={state.entries} place={place} zoneId={player.zoneId} level={player.level} /> : null}
    </div>
  );
}
