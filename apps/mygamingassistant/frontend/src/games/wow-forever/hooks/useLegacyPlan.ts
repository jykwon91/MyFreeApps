import { useCallback, useMemo } from "react";
import { LEGACY_PLAN_PARAM } from "@/games/wow-forever/data/legacy/legacyConfig";
import { useLiveSearchParams } from "@/games/wow-forever/hooks/useLiveSearchParams";
import { decodeLegacyPlan, encodeLegacyPlan } from "@/games/wow-forever/lib/legacy/legacyPlanCode";
import { addRank, emptyPlan, removeRank } from "@/games/wow-forever/lib/legacy/legacyRules";
import type { LegacyData } from "@/games/wow-forever/types/legacy/legacyData";
import type { LegacyPlan } from "@/games/wow-forever/types/legacy/legacyPlan";
import type { LegacyPlanState } from "@/games/wow-forever/types/legacy/legacyPlanState";

interface ReadPlan {
  plan: LegacyPlan;
  broken: boolean;
}

function readPlan(params: URLSearchParams, data: LegacyData): ReadPlan {
  const code = params.get(LEGACY_PLAN_PARAM);
  const decoded = code ? decodeLegacyPlan(code, data.trees, data.cap) : null;
  return { plan: decoded ?? emptyPlan(data.trees), broken: Boolean(code) && decoded === null };
}

function writePlan(params: URLSearchParams, plan: LegacyPlan): URLSearchParams {
  const next = new URLSearchParams(params);
  const code = encodeLegacyPlan(plan);
  if (code) next.set(LEGACY_PLAN_PARAM, code);
  else next.delete(LEGACY_PLAN_PARAM);
  return next;
}

/**
 * The planner's plan, kept in the URL (`?b=`) so the address is the share
 * link. Every change replaces the history entry — Back leaves the planner
 * rather than undoing points.
 */
export function useLegacyPlan(data: LegacyData): LegacyPlanState {
  const [params, setParams] = useLiveSearchParams();
  const { plan, broken } = useMemo(() => readPlan(params, data), [params, data]);

  const change = useCallback(
    (update: (plan: LegacyPlan) => LegacyPlan) => {
      setParams((prev) => writePlan(prev, update(readPlan(prev, data).plan)), { replace: true });
    },
    [setParams, data],
  );

  const add = useCallback(
    (tree: number, node: number) => change((p) => addRank(data.trees, p, data.cap, tree, node)),
    [change, data],
  );
  const remove = useCallback(
    (tree: number, node: number) => change((p) => removeRank(data.trees, p, data.cap, tree, node)),
    [change, data],
  );
  const reset = useCallback(() => change(() => emptyPlan(data.trees)), [change, data]);

  return { plan, brokenLink: broken, add, remove, reset };
}
