import { useCallback, useEffect, useMemo, useState } from "react";
import type { WalkGraphs } from "@/games/wow-forever/worldMap/directions";
import { decodeWalkGraph, inflateWalkFile, type WalkGraph } from "@/games/wow-forever/worldMap/walkGraph";

/** Continents with a generated walk graph (`public/wow-walk/<mapId>.walk`). */
export const WALK_GRAPH_MAPS: ReadonlySet<number> = new Set([0, 1, 2991, 2997]);

export const WALK_STATUS = { idle: "idle", loading: "loading", ready: "ready", error: "error" } as const;
export type WalkStatus = (typeof WALK_STATUS)[keyof typeof WALK_STATUS];

export interface WalkGraphsState {
  graphs: WalkGraphs;
  status: WalkStatus;
  retry: () => void;
}

// A continent's graph is a few MB: fetched once per page load, shared by every trip.
const loaded = new Map<number, Promise<WalkGraph>>();

async function fetchWalkGraph(mapId: number): Promise<WalkGraph> {
  const res = await fetch(`/wow-walk/${mapId}.walk`);
  if (!res.ok) throw new Error(`walk graph ${mapId}: HTTP ${res.status}`);
  return decodeWalkGraph(await inflateWalkFile(await res.arrayBuffer()));
}

/** A walk file, fetched once per page load (a failed fetch is retried next time). */
export function loadWalkGraph(mapId: number): Promise<WalkGraph> {
  let pending = loaded.get(mapId);
  if (!pending) {
    pending = fetchWalkGraph(mapId);
    loaded.set(mapId, pending);
    // A failed fetch is forgotten, so Retry fetches again.
    pending.catch(() => loaded.delete(mapId));
  }
  return pending;
}

/**
 * The walk graphs for these continents, loaded on demand (only while
 * directions are open). Continents without a graph are skipped — their
 * walks stay straight lines.
 */
export function useWalkGraphs(continents: readonly number[]): WalkGraphsState {
  const key = [...new Set(continents.filter((c) => WALK_GRAPH_MAPS.has(c)))].sort((a, b) => a - b).join(",");
  const [graphs, setGraphs] = useState<ReadonlyMap<number, WalkGraph>>(new Map());
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key) return;
    let active = true;
    const ids = key.split(",").map(Number);
    Promise.all(ids.map(loadWalkGraph))
      .then((list) => {
        if (!active) return;
        setFailed(null);
        setGraphs((prev) => {
          const next = new Map(prev);
          list.forEach((g) => next.set(g.mapId, g));
          return next;
        });
      })
      .catch(() => {
        if (active) setFailed(key);
      });
    return () => {
      active = false;
    };
  }, [key, attempt]);

  const retry = useCallback(() => {
    setFailed(null);
    setAttempt((n) => n + 1);
  }, []);

  const wanted = useMemo(() => (key ? key.split(",").map(Number) : []), [key]);
  const ready = wanted.every((id) => graphs.has(id));
  let status: WalkStatus = WALK_STATUS.idle;
  if (wanted.length) {
    if (ready) status = WALK_STATUS.ready;
    else status = failed === key ? WALK_STATUS.error : WALK_STATUS.loading;
  }
  return { graphs, status, retry };
}
