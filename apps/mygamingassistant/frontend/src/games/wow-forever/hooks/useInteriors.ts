import { useCallback, useEffect, useState } from "react";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import { loadWalkGraph, WALK_STATUS, type WalkStatus } from "@/games/wow-forever/hooks/useWalkGraphs";
import { loadInteriors, ROUTE_FROM, type Interior, type RouteFrom } from "@/games/wow-forever/worldMap/interiors";
import type { WalkGraph } from "@/games/wow-forever/worldMap/walkGraph";

/** Every dungeon's interior (instance map id -> interior), or null until loaded / when it failed. */
export function useInteriors(): ReadonlyMap<number, Interior> | null {
  const [interiors, setInteriors] = useState<ReadonlyMap<number, Interior> | null>(null);
  useEffect(() => {
    let active = true;
    // No interiors = no "Inside" buttons; the rest of the list doesn't depend on them.
    loadInteriors()
      .then((m) => active && setInteriors(m))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return interiors;
}

export interface InteriorWalkState {
  graph: WalkGraph | null;
  status: WalkStatus;
  retry: () => void;
}

/** A dungeon's walk graph, fetched the first time `enabled` is true. */
export function useInteriorWalk(mapId: number, enabled: boolean): InteriorWalkState {
  const [graph, setGraph] = useState<WalkGraph | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadWalkGraph(mapId)
      .then((g) => {
        if (!active) return;
        setFailed(false);
        setGraph(g);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [mapId, enabled, attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  let status: WalkStatus = WALK_STATUS.idle;
  if (graph) status = WALK_STATUS.ready;
  else if (failed) status = WALK_STATUS.error;
  else if (enabled) status = WALK_STATUS.loading;
  return { graph, status, retry };
}

export const INTERIOR_SETTINGS_STORAGE_KEY = "mga.wowForever.worldMap.interior.v1";

export function parseRouteFrom(raw: unknown): RouteFrom | null {
  if (typeof raw !== "object" || raw === null) return null;
  const from = (raw as Record<string, unknown>).from;
  return Object.values(ROUTE_FROM).find((v) => v === from) ?? null;
}

/** Where boss routes start: the boss before (default — you clear in order) or the entrance (after a wipe). */
export function useRouteFrom(): [RouteFrom, (from: RouteFrom) => void] {
  const [from, setFrom] = useState<RouteFrom>(() =>
    readStored(INTERIOR_SETTINGS_STORAGE_KEY, parseRouteFrom, ROUTE_FROM.previous),
  );
  const update = useCallback((next: RouteFrom) => {
    setFrom(next);
    writeStored(INTERIOR_SETTINGS_STORAGE_KEY, { from: next });
  }, []);
  return [from, update];
}
