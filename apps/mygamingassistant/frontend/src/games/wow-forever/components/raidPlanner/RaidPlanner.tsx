import { showError, showSuccess } from "@platform/ui";
import { useState } from "react";
import { useSaveRaidPlanMutation } from "@/games/wow-forever/api/wowRaidsApi";
import RaidNotFound from "@/games/wow-forever/components/raid/RaidNotFound";
import RaidPageMeta from "@/games/wow-forever/components/raid/RaidPageMeta";
import GroupPlanner from "@/games/wow-forever/components/raidPlanner/GroupPlanner";
import PlannerHeader from "@/games/wow-forever/components/raidPlanner/PlannerHeader";
import PlannerLinkProblem from "@/games/wow-forever/components/raidPlanner/PlannerLinkProblem";
import PlannerReadOnlyBanner from "@/games/wow-forever/components/raidPlanner/PlannerReadOnlyBanner";
import PlannerToolbar from "@/games/wow-forever/components/raidPlanner/PlannerToolbar";
import UnsavedChangesGuard from "@/games/wow-forever/components/raidPlanner/UnsavedChangesGuard";
import { RAID_STATE } from "@/games/wow-forever/data/raidPage";
import { PLANNER_CLOCK_TICK_MS, PLANNER_MAIN_CLASS, PLANNER_MESSAGE } from "@/games/wow-forever/data/raidPlanner";
import { useGroupPlan } from "@/games/wow-forever/hooks/useGroupPlan";
import { useNow } from "@/games/wow-forever/hooks/useNow";
import { toPayload } from "@/games/wow-forever/lib/raidGroups";
import { REFUSAL, planRefusal, type PlanRefusal, type PlannerStop } from "@/games/wow-forever/lib/raidPlanError";
import { savedMessage } from "@/games/wow-forever/lib/raidPlanLabels";
import type { RaidState } from "@/games/wow-forever/types/raid";
import type { PlannerArgs, PlanReload, RaidPlan, RaidPlanSaved } from "@/games/wow-forever/types/raidPlan";

interface RaidPlannerProps {
  /** The plan as first read. */
  initialPlan: RaidPlan;
  args: PlannerArgs;
  /** A read of the plan is under way. */
  isReloading: boolean;
  /** Read the plan again. */
  reload: () => Promise<PlanReload>;
}

/**
 * The leader's group planner: the raid's seated players, dragged — or moved with each one's Move-to list — into its
 * groups of five, then saved. Nothing is sent until Save. A refused save says why and, when someone else saved in
 * between or the sign-ups moved, shows the groups as they are now; an expired link shows how to get a new one.
 */
export default function RaidPlanner({ initialPlan, args, isReloading, reload }: RaidPlannerProps) {
  const groups = useGroupPlan(initialPlan);
  const { plan, placements, published, dirty, reset } = groups;
  const [saveRaidPlan, { isLoading: isSaving }] = useSaveRaidPlanMutation();
  const [stop, setStop] = useState<PlannerStop | null>(null);
  // A save refused as `raid_over` before the plan's own state says so.
  const [refusedAsOver, setRefusedAsOver] = useState(false);
  const now = useNow(PLANNER_CLOCK_TICK_MS);

  const refresh = async (): Promise<void> => {
    const result = await reload();
    if ("plan" in result) {
      reset(result.plan);
      return;
    }
    const refusal = planRefusal(result.error, PLANNER_MESSAGE.RELOAD_FAILED);
    if (isStop(refusal)) {
      setStop(refusal.kind);
      return;
    }
    showError(refusal.message);
  };

  const save = async (): Promise<void> => {
    let saved: RaidPlanSaved;
    try {
      saved = await saveRaidPlan({ ...args, body: toPayload(plan.version, published, placements) }).unwrap();
    } catch (error) {
      const refusal = planRefusal(error);
      if (isStop(refusal)) {
        setStop(refusal.kind);
        return;
      }
      showError(refusal.message);
      if (refusal.kind === REFUSAL.OVER) setRefusedAsOver(true);
      if (refusal.kind === REFUSAL.OVER || refusal.kind === REFUSAL.RELOAD) await refresh();
      return;
    }
    reset(saved.plan);
    showSuccess(savedMessage(saved.dropped.length));
  };

  if (stop === REFUSAL.LINK) return <PlannerLinkProblem />;
  if (stop === REFUSAL.GONE) return <RaidNotFound />;
  const readOnlyMessage = readOnlyMessageOf(plan.state, refusedAsOver);
  const readOnly = readOnlyMessage !== null;
  return (
    <main className={PLANNER_MAIN_CLASS}>
      <RaidPageMeta title={`Groups — ${plan.title}`} />
      <PlannerHeader plan={plan} now={now} />
      {readOnlyMessage !== null && <PlannerReadOnlyBanner message={readOnlyMessage} />}
      {!readOnly && (
        <PlannerToolbar
          groups={groups}
          isSaving={isSaving}
          isReloading={isReloading}
          onSave={() => void save()}
          onReload={() => void refresh()}
        />
      )}
      {plan.players.length === 0 && (
        <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">{PLANNER_MESSAGE.NOBODY_SEATED}</p>
      )}
      {plan.players.length > 0 && (
        <GroupPlanner board={{ plan, placements, readOnly, locked: isSaving, onPlace: groups.place }} />
      )}
      <UnsavedChangesGuard when={dirty && !readOnly} />
    </main>
  );
}

function isStop(refusal: PlanRefusal): refusal is { kind: PlannerStop } {
  return refusal.kind === REFUSAL.LINK || refusal.kind === REFUSAL.GONE;
}

/** Why nothing can be moved — the raid was cancelled, or is over — or null while the leader can plan. */
function readOnlyMessageOf(state: RaidState, refusedAsOver: boolean): string | null {
  if (state === RAID_STATE.CANCELLED) return PLANNER_MESSAGE.CANCELLED;
  if (state === RAID_STATE.COMPLETED || refusedAsOver) return PLANNER_MESSAGE.OVER;
  return null;
}
