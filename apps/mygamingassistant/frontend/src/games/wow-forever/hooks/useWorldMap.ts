import { useMemo } from "react";
import { useGetMapCapturesQuery } from "@/games/wow-forever/api/wowMapCapturesApi";
import type { WorldMapData } from "@/games/wow-forever/types/worldMap";
import { LOAD_STATUS, useWorldMapData, type LoadStatus } from "@/games/wow-forever/hooks/useWorldMapData";
import { applyCaptures } from "@/games/wow-forever/worldMap/capture/applyCaptures";

export interface WorldMapState {
  status: LoadStatus;
  /** Classic data with the in-game captures laid over it. */
  data: WorldMapData | null;
  retry: () => void;
  /** Captures didn't load — the map shows Classic locations only. */
  capturesFailed: boolean;
}

/**
 * The World Map's data: the static Classic seed plus the captures from the
 * API. Waits for both so results don't jump around when captures arrive;
 * if captures fail, the Classic map still works.
 */
export function useWorldMap(): WorldMapState {
  const base = useWorldMapData();
  const captures = useGetMapCapturesQuery();
  const capturesPending = captures.isLoading;
  const capturesFailed = captures.isError;

  const data = useMemo(() => {
    if (!base.data || capturesPending) return null;
    return applyCaptures(base.data, captures.data?.captures ?? []);
  }, [base.data, capturesPending, captures.data]);

  const status = base.status === LOAD_STATUS.ready && capturesPending ? LOAD_STATUS.loading : base.status;
  return { status, data, retry: base.retry, capturesFailed };
}
