import UseCharacterReset from "@/games/wow-forever/components/character/UseCharacterReset";
import { useCharacterReset } from "@/games/wow-forever/hooks/useCharacterReset";
import { Link } from "react-router-dom";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import { DETAIL_LINK } from "@/games/wow-forever/components/food/detail/detailStyles";
import DropRecipeBrowser from "@/games/wow-forever/components/dropRecipes/DropRecipeBrowser";
import DropRecipesSkeleton from "@/games/wow-forever/components/dropRecipes/DropRecipesSkeleton";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { DROP_RECIPES_TEXT } from "@/games/wow-forever/data/dropRecipes/dropRecipesConfig";
import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { PLAYER_FACTION_OPTIONS } from "@/games/wow-forever/data/playerFactionOptions";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useDropRecipes } from "@/games/wow-forever/hooks/useDropRecipes";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

/** /wow-forever/recipe-drops — every crafting recipe you can only get from a monster drop, and where to farm it (Enchanting first). */
export default function WowDropRecipesPage() {
  useDocumentTitle(DROP_RECIPES_TEXT.documentTitle);
  const state = useDropRecipes();
  const [player, updatePlayer] = usePlayerSettings();
  const characterDefault = useCharacterReset();
  return (
    <div className="p-4 sm:p-8 space-y-4 max-w-4xl">
      <WowPageHeader title={DROP_RECIPES_TEXT.title} subtitle={DROP_RECIPES_TEXT.subtitle} backTo="/wow-forever" backLabel="Back to WoW Forever" />
      <div className="space-y-1 rounded-lg border bg-card p-3 text-sm" data-testid="drop-recipes-note">
        <p>
          <ProvenanceBadge provenance={PROVENANCE.classic} /> {DROP_RECIPES_TEXT.classicNote}
        </p>
        <p className="text-muted-foreground">
          {DROP_RECIPES_TEXT.vendorNote}{" "}
          <Link to="/wow-forever/professions" className={DETAIL_LINK}>
            {DROP_RECIPES_TEXT.vendorLink}
          </Link>
          .
        </p>
      </div>
      <SegmentedToggle label="Faction" options={PLAYER_FACTION_OPTIONS} value={player.faction} onChange={(faction) => updatePlayer({ faction })} />
      <UseCharacterReset state={characterDefault} />
      {state.status === LOAD_STATUS.error ? <LoadErrorRetry message={DROP_RECIPES_TEXT.loadError} onRetry={state.retry} retrying={false} /> : null}
      {state.status === LOAD_STATUS.loading ? <DropRecipesSkeleton /> : null}
      {state.status === LOAD_STATUS.ready ? <DropRecipeBrowser recipes={state.recipes} faction={player.faction} /> : null}
    </div>
  );
}
