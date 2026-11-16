import { useId, useMemo, useState } from "react";
import { ChevronDown, ScrollText } from "lucide-react";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import TrainerRecipeRow from "@/games/wow-forever/components/trainers/TrainerRecipeRow";
import { RANK_RECIPES_COPY } from "@/games/wow-forever/data/trainers/trainersConfig";
import { useRecipeLookup } from "@/games/wow-forever/hooks/useRecipeLookup";
import { useTrainerNpcSpells } from "@/games/wow-forever/hooks/useTrainerNpcSpells";
import { rankRecipes } from "@/games/wow-forever/lib/trainers/rankRecipes";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { ProfessionRankStep } from "@/games/wow-forever/types/trainers/professionRankStep";

interface RankRecipesListProps {
  rankName: string;
  profession: CraftingProfession;
  /** Every rank of the profession, in order — where one rank's recipes end and the next's begin. */
  steps: readonly ProfessionRankStep[];
}

/**
 * "What Journeyman teaches · 18 recipes": opens every recipe its trainers teach, with skill and cost.
 * Mounted only for crafting professions, so only they load the trainer lists and the recipe book.
 */
export default function RankRecipesList({ rankName, profession, steps }: RankRecipesListProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const npcSpells = useTrainerNpcSpells();
  const lookup = useRecipeLookup();
  const npcSpellsData = npcSpells.status === "ready" ? npcSpells.data : null;
  const rows = useMemo(
    () => (npcSpellsData && lookup ? (rankRecipes(profession, steps, npcSpellsData[profession], lookup).get(rankName) ?? []) : null),
    [npcSpellsData, lookup, profession, steps, rankName],
  );
  if (npcSpells.status === "error") {
    return <LoadErrorRetry message={RANK_RECIPES_COPY.error} onRetry={npcSpells.retry} retrying={false} />;
  }
  if (rows && rows.length === 0) return null;
  return (
    <div className="space-y-1" data-testid="rank-recipes">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={!rows}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-2 hover:underline disabled:opacity-60 min-h-[44px] sm:min-h-[32px]"
      >
        <ScrollText className="h-4 w-4 shrink-0" aria-hidden />
        {rows ? RANK_RECIPES_COPY.toggle(rankName, rows.length) : RANK_RECIPES_COPY.loading(rankName)}
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && rows ? (
        <ul id={listId} aria-label={RANK_RECIPES_COPY.listLabel(rankName)} className="divide-y">
          {rows.map((row) => (
            <TrainerRecipeRow key={row.spell} row={row} profession={profession} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
