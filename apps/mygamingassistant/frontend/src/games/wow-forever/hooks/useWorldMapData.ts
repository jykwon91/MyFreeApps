import { useCallback, useEffect, useState } from "react";
import type { WorldMapData } from "@/games/wow-forever/types/worldMap";
import { loadWorldMap } from "@/games/wow-forever/worldMap/loadWorldMap";

export const LOAD_STATUS = { loading: "loading", ready: "ready", error: "error" } as const;
export type LoadStatus = (typeof LOAD_STATUS)[keyof typeof LOAD_STATUS];

export interface WorldMapDataState {
  status: LoadStatus;
  data: WorldMapData | null;
  retry: () => void;
}

export function useWorldMapData(): WorldMapDataState {
  const [status, setStatus] = useState<LoadStatus>(LOAD_STATUS.loading);
  const [data, setData] = useState<WorldMapData | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    loadWorldMap()
      .then((loaded) => {
        if (!active) return;
        setData(loaded);
        setStatus(LOAD_STATUS.ready);
      })
      .catch(() => {
        if (active) setStatus(LOAD_STATUS.error);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setStatus(LOAD_STATUS.loading);
    setAttempt((n) => n + 1);
  }, []);

  return { status, data, retry };
}
