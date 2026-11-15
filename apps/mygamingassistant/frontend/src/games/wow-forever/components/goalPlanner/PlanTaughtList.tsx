import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { GOAL_PLANNER_TEXT } from "@/games/wow-forever/data/goalPlanner/goalPlannerText";
import { spellIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { TaughtRecipe } from "@/games/wow-forever/types/goalPlanner/taughtRecipe";

/** The trainer recipes the route uses that this visit opens, folded under a count. */
export default function PlanTaughtList({ recipes }: { recipes: readonly TaughtRecipe[] }) {
  if (!recipes.length) return null;
  return (
    <details className="text-sm" data-testid="plan-stop-teaches">
      <summary className="flex min-h-[44px] cursor-pointer items-center">
        {recipes.length} {recipes.length === 1 ? GOAL_PLANNER_TEXT.teachesOne : GOAL_PLANNER_TEXT.teachesMany}
      </summary>
      <ul className="space-y-1 pb-1">
        {recipes.map((r) => (
          <li key={r.spell} className="flex items-center gap-2">
            <GameIcon icon={spellIcon(r.spell)} size={16} alt="" />
            <span className="flex-1">{r.name}</span>
            <span className="text-xs text-muted-foreground">{r.skill}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
