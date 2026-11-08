import { useCallback, useMemo } from "react";
import {
  MAX_TALENT_LEVEL,
  TALENT_BUILD_PARAM,
  TALENT_LEVEL_PARAM,
  TALENT_ORDER_PARAM,
} from "@/games/wow-forever/data/talents/talentConfig";
import { useLiveSearchParams } from "@/games/wow-forever/hooks/useLiveSearchParams";
import { decodeTalentBuild, decodeTalentLevel, encodeTalentBuild } from "@/games/wow-forever/lib/talents/talentBuildCode";
import {
  decodeTalentOrder,
  encodeTalentOrder,
  isValidOrder,
  removeFromOrder,
  settleOrder,
} from "@/games/wow-forever/lib/talents/talentOrderCode";
import { addPoint, emptyBuild, minimumLevel, removePoint } from "@/games/wow-forever/lib/talents/talentRules";
import type { TalentBuild } from "@/games/wow-forever/types/talents/talentBuild";
import type { TalentBuildState } from "@/games/wow-forever/types/talents/talentBuildState";
import type { TalentOrderEntry } from "@/games/wow-forever/types/talents/talentOrderEntry";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

interface ReadBuild {
  build: TalentBuild;
  level: number;
  broken: boolean;
  order: readonly TalentOrderEntry[] | null;
}

/** The build, level and spend order a query names; a `?b=` this class can't have reads as an empty build. */
function readBuild(params: URLSearchParams, trees: readonly TalentTree[]): ReadBuild {
  const code = params.get(TALENT_BUILD_PARAM);
  const decoded = code ? decodeTalentBuild(code, trees) : null;
  const build = decoded ?? emptyBuild(trees);
  const level = Math.max(decodeTalentLevel(params.get(TALENT_LEVEL_PARAM)) ?? MAX_TALENT_LEVEL, minimumLevel(build));

  const orderCode = params.get(TALENT_ORDER_PARAM);
  let order: readonly TalentOrderEntry[] | null = null;
  if (orderCode !== null) {
    const entries = decodeTalentOrder(orderCode, trees);
    if (entries !== null && isValidOrder(entries, trees, build)) {
      order = entries;
    }
    // Invalid or inconsistent order → treat as absent (don't break the page).
  }

  return { build, level, broken: Boolean(code) && decoded === null, order };
}

function writeBuild(
  params: URLSearchParams,
  build: TalentBuild,
  level: number,
  order: readonly TalentOrderEntry[] | null,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const code = encodeTalentBuild(build);
  if (code) next.set(TALENT_BUILD_PARAM, code);
  else next.delete(TALENT_BUILD_PARAM);
  if (level === MAX_TALENT_LEVEL) next.delete(TALENT_LEVEL_PARAM);
  else next.set(TALENT_LEVEL_PARAM, String(level));
  if (order !== null && order.length > 0) {
    next.set(TALENT_ORDER_PARAM, encodeTalentOrder(order));
  } else {
    next.delete(TALENT_ORDER_PARAM);
  }
  return next;
}

/**
 * The calculator's build, level and spend order, kept in the URL (`?b=`,
 * `?lvl=`, `?o=`) so the address is the share link. Every change replaces the
 * history entry — Back leaves the calculator rather than undoing points.
 */
export function useTalentBuild(trees: readonly TalentTree[]): TalentBuildState {
  const [params, setParams] = useLiveSearchParams();
  const { build, level, broken, order } = useMemo(() => readBuild(params, trees), [params, trees]);

  const change = useCallback(
    (
      update: (read: ReadBuild) => {
        build: TalentBuild;
        level: number;
        order: readonly TalentOrderEntry[] | null;
      },
    ) => {
      setParams(
        (prev) => {
          const next = update(readBuild(prev, trees));
          return writeBuild(prev, next.build, next.level, next.order);
        },
        { replace: true },
      );
    },
    [setParams, trees],
  );

  const add = useCallback(
    (tree: number, talent: number) =>
      change((r) => ({
        build: addPoint(trees, r.build, tree, talent, r.level),
        level: r.level,
        // Append to order; start tracking even if order was absent before.
        order: [...(r.order ?? []), [tree, talent]],
      })),
    [change, trees],
  );

  const remove = useCallback(
    (tree: number, talent: number) =>
      change((r) => ({
        build: removePoint(trees, r.build, tree, talent),
        level: r.level,
        // Drop this talent's last entry, then reorder so later points that
        // relied on it still replay legally.
        order: r.order !== null ? settleOrder(removeFromOrder(r.order, tree, talent), trees) : null,
      })),
    [change, trees],
  );

  const setLevel = useCallback(
    (wanted: number) =>
      change((r) => ({
        build: r.build,
        level: Math.min(Math.max(Math.round(wanted), minimumLevel(r.build)), MAX_TALENT_LEVEL),
        order: r.order,
      })),
    [change],
  );

  const reset = useCallback(
    () =>
      change((r) => ({
        build: emptyBuild(trees),
        level: r.level,
        order: [],
      })),
    [change, trees],
  );

  return { build, level, minLevel: minimumLevel(build), brokenLink: broken, order, add, remove, setLevel, reset };
}
