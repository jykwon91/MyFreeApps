import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import NumberField from "@/games/wow-forever/components/shared/NumberField";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import TrainerRecipeRow from "@/games/wow-forever/components/trainers/TrainerRecipeRow";
import TrainerRecipesPanelHeader from "@/games/wow-forever/components/trainers/TrainerRecipesPanelHeader";
import TrainerRecipesSkeleton from "@/games/wow-forever/components/trainers/TrainerRecipesSkeleton";
import { MAX_CRAFT_SKILL } from "@/games/wow-forever/crafting/craftRoute";
import { CLASSIC_TRAINERS_TAG } from "@/games/wow-forever/data/provenance/provenanceTags";
import { useCraftingSkill } from "@/games/wow-forever/hooks/useCraftingSkill";
import { useRecipeLookup } from "@/games/wow-forever/hooks/useRecipeLookup";
import { useTrainerNpcSpells } from "@/games/wow-forever/hooks/useTrainerNpcSpells";
import { trainerNpcRecipes } from "@/games/wow-forever/lib/trainers/trainerRecipes";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";

interface TrainerRecipesPanelProps {
  npcId: number;
  trainerName: string;
  profession: CraftingProfession;
  onClose: () => void;
}

/**
 * All recipes a trainer NPC teaches, with can-learn highlighting.
 * Loaded lazily; `onClose` navigates back to the trainer list.
 */
export default function TrainerRecipesPanel({ npcId, trainerName, profession, onClose }: TrainerRecipesPanelProps) {
  const spells = useTrainerNpcSpells();
  const lookup = useRecipeLookup();
  const [playerSkill, updateSkill] = useCraftingSkill(profession);

  const isLoading = spells.status === "loading" || (spells.status === "ready" && lookup === null);

  if (spells.status === "error") {
    return (
      <div className="rounded-xl border bg-card p-4 space-y-3" data-testid="trainer-recipes-panel">
        <TrainerRecipesPanelHeader name={trainerName} onClose={onClose} />
        <LoadErrorRetry message="Couldn't load trainer recipes." onRetry={spells.retry} retrying={false} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-4 space-y-3" data-testid="trainer-recipes-panel">
        <TrainerRecipesPanelHeader name={trainerName} onClose={onClose} />
        <TrainerRecipesSkeleton />
      </div>
    );
  }

  const rows = trainerNpcRecipes(npcId, profession, spells.data, lookup, playerSkill);
  const canLearnCount = rows.filter((r) => r.status === "can-learn").length;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3" data-testid="trainer-recipes-panel">
      <TrainerRecipesPanelHeader name={trainerName} onClose={onClose} />
      <div className="flex flex-wrap items-end gap-3">
        <NumberField
          label="Your skill"
          value={playerSkill}
          min={1}
          max={MAX_CRAFT_SKILL}
          onChange={updateSkill}
          className="flex flex-col gap-1 w-28"
        />
        {playerSkill !== null && rows.length > 0 && (
          <p className="text-sm text-muted-foreground pb-1">
            {canLearnCount === rows.length
              ? `All ${rows.length} learnable now`
              : canLearnCount > 0
                ? `${canLearnCount} of ${rows.length} learnable now`
                : `None learnable yet`}
          </p>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recipe data for this trainer.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <TrainerRecipeRow key={row.spell} row={row} profession={profession} />
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        <ProvenanceBadge {...CLASSIC_TRAINERS_TAG} />
      </p>
    </div>
  );
}
