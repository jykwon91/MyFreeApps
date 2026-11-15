import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { formatCost } from "@/games/wow-forever/crafting/matPrices";
import { PLANNER_PROFESSION_LABELS } from "@/games/wow-forever/data/goalPlanner/goalPlannerConfig";
import { GOAL_PLANNER_TEXT } from "@/games/wow-forever/data/goalPlanner/goalPlannerText";
import { craftRowIcon } from "@/games/wow-forever/lib/goalPlanner/craftRowIcon";
import type { PlanCraftRow } from "@/games/wow-forever/types/goalPlanner/planCraftRow";

/** One stretch of crafting: what to make, from which skill to which, how many times and what it costs. */
export default function PhaseCraftRow({ row }: { row: PlanCraftRow }) {
  return (
    <li className="flex items-center gap-2 py-1.5 text-sm" data-testid="plan-craft-row">
      <GameIcon icon={craftRowIcon(row)} size={24} alt="" />
      <div className="min-w-0 flex-1">
        <p>
          {row.name}
          {row.crafts !== null ? <span className="text-muted-foreground"> ×{row.crafts}</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {PLANNER_PROFESSION_LABELS[row.profession]} {row.from}–{row.to}
          {row.trainerSkill !== null ? ` · ${GOAL_PLANNER_TEXT.trainerRecipe} ${row.trainerSkill}` : ""}
        </p>
      </div>
      {row.cost !== undefined ? <span className="shrink-0 tabular-nums">{formatCost(row.cost)}</span> : null}
    </li>
  );
}
