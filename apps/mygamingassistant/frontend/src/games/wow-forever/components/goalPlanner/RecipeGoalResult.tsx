import { Check, Plus } from "lucide-react";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { PLANNER_PROFESSION_LABELS } from "@/games/wow-forever/data/goalPlanner/goalPlannerConfig";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

interface RecipeGoalResultProps {
  entry: RecipeEntry;
  added: boolean;
  onAdd: () => void;
}

/** A search result: the recipe, its profession and skill; tap to add it to the plan. */
export default function RecipeGoalResult({ entry, added, onAdd }: RecipeGoalResultProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onAdd}
        disabled={added}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-md border bg-card px-3 py-1 text-left text-sm hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
        data-testid="recipe-goal-result"
      >
        <GameIcon icon={entry.icon} size={24} alt="" />
        <span className="flex-1">
          {entry.name}
          <span className="block text-xs text-muted-foreground">
            {PLANNER_PROFESSION_LABELS[entry.profession]} {entry.skill}
          </span>
        </span>
        {added ? <Check className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4 text-muted-foreground" aria-hidden />}
      </button>
    </li>
  );
}
