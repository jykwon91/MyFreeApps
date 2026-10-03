import { skipToken } from "@reduxjs/toolkit/query/react";
import { useCallback } from "react";
import { useParams } from "react-router-dom";
import { useGetRaidPlanQuery } from "@/games/wow-forever/api/wowRaidsApi";
import RaidLoadError from "@/games/wow-forever/components/raid/RaidLoadError";
import RaidNotFound from "@/games/wow-forever/components/raid/RaidNotFound";
import PlannerLinkProblem from "@/games/wow-forever/components/raidPlanner/PlannerLinkProblem";
import PlannerSkeleton from "@/games/wow-forever/components/raidPlanner/PlannerSkeleton";
import RaidPlanner from "@/games/wow-forever/components/raidPlanner/RaidPlanner";
import { RAID_PROBLEM } from "@/games/wow-forever/data/raidPage";
import { usePlannerToken } from "@/games/wow-forever/hooks/usePlannerToken";
import { raidPageProblem } from "@/games/wow-forever/lib/raidPageError";
import { isLinkProblem } from "@/games/wow-forever/lib/raidPlanError";
import type { PlannerArgs, PlanReload } from "@/games/wow-forever/types/raidPlan";

/**
 * A raid's group planner — `/wow-forever/raids/:webId/plan#k=<token>`, the link [Groups] on Raid: Edit gives the
 * raid's leader, good for two hours.
 *
 * The link's token is the only key — every request sends it as `Authorization: RaidPlanner <token>` — so it isn't
 * gated by `isReadOnly()` or a sign-in: it is the same page on the serve-only site and inside the Discord Activity.
 */
export default function WowRaidPlannerPage() {
  const { webId = "" } = useParams();
  const token = usePlannerToken(webId);
  const args = plannerArgs(webId, token);
  const query = useGetRaidPlanQuery(args ?? skipToken);
  const { refetch } = query;
  const reload = useCallback(async (): Promise<PlanReload> => {
    try {
      return { plan: await refetch().unwrap() };
    } catch (error) {
      return { error };
    }
  }, [refetch]);

  if (args === null) return <PlannerLinkProblem />;
  if (query.currentData !== undefined) {
    return (
      <RaidPlanner
        key={webId}
        initialPlan={query.currentData}
        args={args}
        isReloading={query.isFetching}
        reload={reload}
      />
    );
  }
  if (isLinkProblem(query.error)) return <PlannerLinkProblem />;
  const problem = raidPageProblem(query.error);
  if (problem !== null && problem.kind === RAID_PROBLEM.NOT_FOUND) return <RaidNotFound />;
  if (problem !== null) {
    return <RaidLoadError message={problem.message} isRetrying={query.isFetching} onRetry={() => void refetch()} />;
  }
  return <PlannerSkeleton />;
}

/** What the plan's requests need; null when this tab has no token for the raid. */
function plannerArgs(webId: string, token: string | null): PlannerArgs | null {
  if (webId === "" || token === null) return null;
  return { webId, token };
}
