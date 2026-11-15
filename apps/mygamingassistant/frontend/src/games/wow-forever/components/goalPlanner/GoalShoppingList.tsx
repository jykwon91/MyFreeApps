import { ShoppingBasket } from "lucide-react";
import GoalShoppingRow from "@/games/wow-forever/components/goalPlanner/GoalShoppingRow";
import { GOAL_PLANNER_TEXT } from "@/games/wow-forever/data/goalPlanner/goalPlannerText";
import type { PlanShoppingLine } from "@/games/wow-forever/types/goalPlanner/planShoppingLine";

/** Every material for every profession on the plan, once each — open by default, folds away. */
export default function GoalShoppingList({ lines }: { lines: readonly PlanShoppingLine[] }) {
  return (
    <details open className="rounded-lg border bg-card px-3 py-2" data-testid="plan-shopping">
      <summary className="flex min-h-[44px] cursor-pointer items-center gap-2 font-semibold">
        <ShoppingBasket className="h-4 w-4" aria-hidden />
        {GOAL_PLANNER_TEXT.shoppingHeading}
        <span className="text-sm font-normal text-muted-foreground">({lines.length})</span>
      </summary>
      {lines.length ? (
        <ul className="divide-y">
          {lines.map((line) => (
            <GoalShoppingRow key={line.id} line={line} />
          ))}
        </ul>
      ) : (
        <p className="pb-2 text-sm text-muted-foreground">{GOAL_PLANNER_TEXT.shoppingEmpty}</p>
      )}
    </details>
  );
}
