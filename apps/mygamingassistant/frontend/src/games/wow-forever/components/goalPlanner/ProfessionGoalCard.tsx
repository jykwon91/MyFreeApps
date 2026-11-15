import { useId } from "react";
import { X } from "lucide-react";
import { Select } from "@platform/ui";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import NumberField from "@/games/wow-forever/components/shared/NumberField";
import { MAX_CRAFT_SKILL } from "@/games/wow-forever/crafting/craftRoute";
import { GOAL_TARGETS, GOAL_TARGET_LABELS, PLANNER_PROFESSION_LABELS } from "@/games/wow-forever/data/goalPlanner/goalPlannerConfig";
import { GOAL_PLANNER_TEXT } from "@/games/wow-forever/data/goalPlanner/goalPlannerText";
import { clampGoalSkill } from "@/games/wow-forever/lib/goalPlanner/clampGoalSkill";
import { professionIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { ProfessionGoal } from "@/games/wow-forever/types/goalPlanner/professionGoal";

interface ProfessionGoalCardProps {
  goal: ProfessionGoal;
  onChange: (change: Partial<Pick<ProfessionGoal, "current" | "target">>) => void;
  onRemove: () => void;
}

/** One profession on the plan: where you are and how far you want to go. */
export default function ProfessionGoalCard({ goal, onChange, onRemove }: ProfessionGoalCardProps) {
  const label = PLANNER_PROFESSION_LABELS[goal.profession];
  const targetId = useId();
  return (
    <li className="rounded-lg border bg-card p-3" data-testid={`goal-${goal.profession}`}>
      <div className="flex items-center gap-2">
        <GameIcon icon={professionIcon(goal.profession)} size={32} alt="" />
        <span className="flex-1 font-medium">{label}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${GOAL_PLANNER_TEXT.remove} ${label}`}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md hover:bg-muted/40"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <NumberField
            label={GOAL_PLANNER_TEXT.currentLabel}
            value={goal.current}
            min={0}
            max={MAX_CRAFT_SKILL}
            onChange={(value) => onChange({ current: clampGoalSkill(value) })}
          />
          <p className="text-xs text-muted-foreground">{GOAL_PLANNER_TEXT.currentHint}</p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={targetId} className="text-sm font-medium">
            {GOAL_PLANNER_TEXT.targetLabel}
          </label>
          <Select
            id={targetId}
            value={String(goal.target)}
            onChange={(e) => onChange({ target: Number(e.target.value) })}
            className="min-h-[44px] bg-card text-base sm:text-sm"
          >
            {GOAL_TARGETS.map((t) => (
              <option key={t} value={t}>
                {GOAL_TARGET_LABELS[`${t}`]}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </li>
  );
}
