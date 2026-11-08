import { useCallback, useMemo } from "react";
import {
  MAX_TALENT_LEVEL,
  TALENT_BUILD_PARAM,
  TALENT_LEVEL_PARAM,
} from "@/games/wow-forever/data/talents/talentConfig";
import { useLiveSearchParams } from "@/games/wow-forever/hooks/useLiveSearchParams";
import { decodeTalentBuild, decodeTalentLevel, encodeTalentBuild } from "@/games/wow-forever/lib/talents/talentBuildCode";
import { addPoint, emptyBuild, minimumLevel, removePoint } from "@/games/wow-forever/lib/talents/talentRules";
import type { TalentBuild } from "@/games/wow-forever/types/talents/talentBuild";
import type { TalentBuildState } from "@/games/wow-forever/types/talents/talentBuildState";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

interface ReadBuild {
  build: TalentBuild;
  level: number;
  broken: boolean;
}

/** The build and level a query names; a `?b=` this class can't have reads as an empty build. */
function readBuild(params: URLSearchParams, trees: readonly TalentTree[]): ReadBuild {
  const code = params.get(TALENT_BUILD_PARAM);
  const decoded = code ? decodeTalentBuild(code, trees) : null;
  const build = decoded ?? emptyBuild(trees);
  const level = Math.max(decodeTalentLevel(params.get(TALENT_LEVEL_PARAM)) ?? MAX_TALENT_LEVEL, minimumLevel(build));
  return { build, level, broken: Boolean(code) && decoded === null };
}

function writeBuild(params: URLSearchParams, build: TalentBuild, level: number): URLSearchParams {
  const next = new URLSearchParams(params);
  const code = encodeTalentBuild(build);
  if (code) next.set(TALENT_BUILD_PARAM, code);
  else next.delete(TALENT_BUILD_PARAM);
  if (level === MAX_TALENT_LEVEL) next.delete(TALENT_LEVEL_PARAM);
  else next.set(TALENT_LEVEL_PARAM, String(level));
  return next;
}

/**
 * The calculator's build, kept in the URL (`?b=` and `?lvl=`) so the address
 * is the share link. Every change replaces the history entry — Back leaves the
 * calculator rather than undoing points — and starts from the newest query, so
 * quick clicks never drop one.
 */
export function useTalentBuild(trees: readonly TalentTree[]): TalentBuildState {
  const [params, setParams] = useLiveSearchParams();
  const { build, level, broken } = useMemo(() => readBuild(params, trees), [params, trees]);

  const change = useCallback(
    (update: (read: ReadBuild) => { build: TalentBuild; level: number }) => {
      setParams(
        (prev) => {
          const next = update(readBuild(prev, trees));
          return writeBuild(prev, next.build, next.level);
        },
        { replace: true },
      );
    },
    [setParams, trees],
  );

  const add = useCallback(
    (tree: number, talent: number) => change((r) => ({ build: addPoint(trees, r.build, tree, talent, r.level), level: r.level })),
    [change, trees],
  );
  const remove = useCallback(
    (tree: number, talent: number) => change((r) => ({ build: removePoint(trees, r.build, tree, talent), level: r.level })),
    [change, trees],
  );
  const setLevel = useCallback(
    (wanted: number) =>
      change((r) => ({ build: r.build, level: Math.min(Math.max(Math.round(wanted), minimumLevel(r.build)), MAX_TALENT_LEVEL) })),
    [change],
  );
  const reset = useCallback(() => change((r) => ({ build: emptyBuild(trees), level: r.level })), [change, trees]);

  return { build, level, minLevel: minimumLevel(build), brokenLink: broken, add, remove, setLevel, reset };
}
