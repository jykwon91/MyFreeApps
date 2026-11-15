import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { formatCost } from "@/games/wow-forever/crafting/matPrices";
import { PLANNER_PROFESSION_LABELS } from "@/games/wow-forever/data/goalPlanner/goalPlannerConfig";
import { GOAL_PLANNER_TEXT } from "@/games/wow-forever/data/goalPlanner/goalPlannerText";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { PlanShoppingLine } from "@/games/wow-forever/types/goalPlanner/planShoppingLine";

/** One material: how many, for which professions, and what they cost at today's prices. */
export default function GoalShoppingRow({ line }: { line: PlanShoppingLine }) {
  const professions = line.professions.map((p) => PLANNER_PROFESSION_LABELS[p]).join(", ");
  return (
    <li className="flex items-center gap-2 py-1.5 text-sm" data-testid="plan-shopping-row">
      <GameIcon icon={itemIcon(line.id)} size={24} alt="" />
      <div className="min-w-0 flex-1">
        <p>
          {line.count !== null ? <span className="tabular-nums">{line.count}× </span> : null}
          {line.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {professions}
          {line.makeWith ? ` · ${GOAL_PLANNER_TEXT.makeWith} ${PLANNER_PROFESSION_LABELS[line.makeWith]}` : ""}
        </p>
      </div>
      {line.total !== undefined ? <span className="shrink-0 tabular-nums">{formatCost(line.total)}</span> : null}
    </li>
  );
}
