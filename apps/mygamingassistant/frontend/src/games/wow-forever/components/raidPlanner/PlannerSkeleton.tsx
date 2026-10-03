import type { ReactElement } from "react";
import RaidPageMeta from "@/games/wow-forever/components/raid/RaidPageMeta";
import {
  GROUP_SIZE,
  PLANNER_GROUPS_CLASS,
  PLANNER_LAYOUT_CLASS,
  PLANNER_MAIN_CLASS,
  PLANNER_SKELETON_GROUPS,
} from "@/games/wow-forever/data/raidPlanner";
import { numbersTo } from "@/games/wow-forever/lib/raidGroups";

const ROWS = numbersTo(GROUP_SIZE);

/** The planner's shape while the plan loads — header, toolbar, "Not in a group" and a few groups — so nothing jumps. */
export default function PlannerSkeleton() {
  return (
    <main className={PLANNER_MAIN_CLASS} aria-busy="true">
      <RaidPageMeta title="Groups" />
      <div className="space-y-2" aria-hidden>
        <div className="h-7 w-2/3 max-w-md animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 max-w-sm animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/3 max-w-xs animate-pulse rounded bg-muted" />
      </div>
      <div className="h-24 animate-pulse rounded-lg border bg-card" aria-hidden />
      <div className={PLANNER_LAYOUT_CLASS} aria-hidden>
        {skeletonCard(0)}
        <div className="@container min-w-0">
          <div className={PLANNER_GROUPS_CLASS}>{numbersTo(PLANNER_SKELETON_GROUPS).map(skeletonCard)}</div>
        </div>
      </div>
    </main>
  );
}

function skeletonCard(key: number): ReactElement {
  return (
    <div key={key} className="space-y-2 rounded-lg border bg-card p-3">
      <div className="h-5 w-28 animate-pulse rounded bg-muted" />
      {ROWS.map((row) => (
        <div key={row} className="h-11 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}
