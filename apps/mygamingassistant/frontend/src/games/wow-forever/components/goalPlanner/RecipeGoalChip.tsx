import { X } from "lucide-react";
import RecipeNameLink from "@/games/wow-forever/components/recipes/RecipeNameLink";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { GOAL_PLANNER_TEXT } from "@/games/wow-forever/data/goalPlanner/goalPlannerText";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

interface RecipeGoalChipProps {
  entry: RecipeEntry;
  onRemove: () => void;
}

/** A recipe on the plan: its name links to the Recipes page; the cross takes it off. */
export default function RecipeGoalChip({ entry, onRemove }: RecipeGoalChipProps) {
  return (
    <li className="flex items-center gap-1 rounded-full border bg-card pl-2 text-sm" data-testid="recipe-goal-chip">
      <GameIcon icon={entry.icon} size={16} alt="" />
      <RecipeNameLink entry={entry}>{entry.name}</RecipeNameLink>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${GOAL_PLANNER_TEXT.remove} ${entry.name}`}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full hover:bg-muted/40"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </li>
  );
}
