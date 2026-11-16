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
import { panelSummary } from "@/games/wow-forever/lib/trainers/markedSummary";
import { markTrainerRecipes } from "@/games/wow-forever/lib/trainers/markTrainerRecipes";
import { trainerNpcRecipes } from "@/games/wow-forever/lib/trainers/trainerRecipes";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { RecipeMarks } from "@/games/wow-forever/types/trainers/recipeMarks";

interface TrainerRecipesPanelProps {
  npcId: number;
  trainerName: string;
  profession: CraftingProfession;
  onClose: () => void;
  /** Your character: its skill replaces the typed one, and recipes it has read "Known". */
  marks: RecipeMarks | null;
}

/**
 * All recipes a trainer NPC teaches, with can-learn highlighting.
 * Loaded lazily; `onClose` navigates back to the trainer list.
 */
export default function TrainerRecipesPanel({ npcId, trainerName, profession, onClose, marks }: TrainerRecipesPanelProps) {
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

  // The character's skill wins over a typed one, except for the other faction's character (only "Known" applies).
  const characterSkill = marks && !marks.knownOnly ? marks.mine.skill : null;
  const skill = characterSkill ?? playerSkill;
  const rows = markTrainerRecipes(trainerNpcRecipes(npcId, profession, spells.data, lookup, skill), marks);
  const summary = panelSummary(rows, skill);

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3" data-testid="trainer-recipes-panel">
      <TrainerRecipesPanelHeader name={trainerName} onClose={onClose} />
      <div className="flex flex-wrap items-end gap-3">
        {characterSkill === null && <NumberField
          label="Your skill"
          value={playerSkill}
          min={1}
          max={MAX_CRAFT_SKILL}
          onChange={updateSkill}
          className="flex flex-col gap-1 w-28"
        />}
        {summary && <p className="text-sm text-muted-foreground pb-1">{summary}</p>}
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
