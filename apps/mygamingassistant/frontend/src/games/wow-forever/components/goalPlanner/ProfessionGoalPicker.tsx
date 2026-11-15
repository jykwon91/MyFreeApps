import { Plus } from "lucide-react";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { PLANNER_PROFESSIONS, PLANNER_PROFESSION_LABELS } from "@/games/wow-forever/data/goalPlanner/goalPlannerConfig";
import { GOAL_PLANNER_TEXT } from "@/games/wow-forever/data/goalPlanner/goalPlannerText";
import { professionIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { PlannerProfession } from "@/games/wow-forever/types/goalPlanner/plannerProfession";

interface ProfessionGoalPickerProps {
  chosen: ReadonlySet<PlannerProfession>;
  onAdd: (profession: PlannerProfession) => void;
}

/** One button per profession not on the plan yet. */
export default function ProfessionGoalPicker({ chosen, onAdd }: ProfessionGoalPickerProps) {
  const left = PLANNER_PROFESSIONS.filter((p) => !chosen.has(p));
  if (!left.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{GOAL_PLANNER_TEXT.addProfession}</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {left.map((p) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => onAdd(p)}
              className="flex min-h-[44px] w-full items-center gap-2 rounded-md border bg-card px-3 text-left text-sm hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid={`add-profession-${p}`}
            >
              <GameIcon icon={professionIcon(p)} size={24} alt="" />
              <span className="flex-1">{PLANNER_PROFESSION_LABELS[p]}</span>
              <Plus className="h-4 w-4 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
