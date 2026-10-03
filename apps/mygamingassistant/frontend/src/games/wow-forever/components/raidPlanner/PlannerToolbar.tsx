import { Button, LoadingButton } from "@platform/ui";
import { WandSparkles } from "lucide-react";
import { useId } from "react";
import ClearGroupsButton from "@/games/wow-forever/components/raidPlanner/ClearGroupsButton";
import CopyAsTextButton from "@/games/wow-forever/components/raidPlanner/CopyAsTextButton";
import PublishSwitch from "@/games/wow-forever/components/raidPlanner/PublishSwitch";
import ReloadButton from "@/games/wow-forever/components/raidPlanner/ReloadButton";
import { GROUP_SIZE, PLANNER_MESSAGE } from "@/games/wow-forever/data/raidPlanner";
import type { GroupPlan } from "@/games/wow-forever/hooks/useGroupPlan";
import { asText, unplacedOf } from "@/games/wow-forever/lib/raidGroups";

interface PlannerToolbarProps {
  groups: GroupPlan;
  isSaving: boolean;
  isReloading: boolean;
  onSave: () => void;
  onReload: () => void;
}

/**
 * The planner's actions — Auto-fill, Clear groups, Copy as text, Reload — then whether raiders see the groups, and
 * Save. Above the groups; from 640 px it stays at the top while they scroll.
 */
export default function PlannerToolbar({ groups, isSaving, isReloading, onSave, onReload }: PlannerToolbarProps) {
  const hintId = useId();
  const { plan, placements, published, dirty } = groups;
  const placed = Object.keys(placements).length;
  const canAutoFill = unplacedOf(plan.players, placements).length > 0 && placed < plan.group_count * GROUP_SIZE;
  return (
    <div className="z-20 space-y-2 rounded-lg border bg-card p-3 sm:sticky sm:top-0">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" className="gap-2" disabled={!canAutoFill || isSaving} onClick={groups.autoFill}>
          <WandSparkles aria-hidden className="h-4 w-4" />
          Auto-fill
        </Button>
        <ClearGroupsButton disabled={placed === 0 || isSaving} onClear={groups.clear} />
        <CopyAsTextButton text={asText(plan.players, placements, plan.group_count)} disabled={placed === 0} />
        <ReloadButton dirty={dirty} disabled={isSaving} isReloading={isReloading} onReload={onReload} />
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <PublishSwitch
            checked={published}
            disabled={isSaving}
            describedBy={hintId}
            onChange={groups.setPublished}
          />
          <span role="status" className="text-sm text-muted-foreground">
            {dirty && PLANNER_MESSAGE.UNSAVED}
          </span>
          <LoadingButton isLoading={isSaving} loadingText="Saving…" disabled={!dirty} onClick={onSave}>
            Save
          </LoadingButton>
        </div>
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        {PLANNER_MESSAGE.PUBLISH_HINT}
      </p>
    </div>
  );
}
