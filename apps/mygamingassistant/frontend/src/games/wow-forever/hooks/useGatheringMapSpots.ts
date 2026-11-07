import { useCallback, useEffect, useState } from "react";
import type { GatheringMapSpot } from "@/games/wow-forever/types/mapLayers/gatheringMapSpot";
import { loadGatheringMapSpots } from "@/games/wow-forever/worldMap/loadGatheringMapSpots";

export const GATHERING_SPOTS_STATUS = { idle: "idle", loading: "loading", ready: "ready", error: "error" } as const;
export type GatheringSpotsStatus = (typeof GATHERING_SPOTS_STATUS)[keyof typeof GATHERING_SPOTS_STATUS];

export interface GatheringSpotsState {
  status: GatheringSpotsStatus;
  spots: readonly GatheringMapSpot[] | null;
  retry: () => void;
}

/** The herb / ore spots, loaded the first time `wanted` is true and kept after that. */
export function useGatheringMapSpots(wanted: boolean): GatheringSpotsState {
  const [spots, setSpots] = useState<readonly GatheringMapSpot[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(false);
  // The browser remembers a module import that failed and won't fetch it again, so a retry reloads the page.
  const retry = useCallback(() => window.location.reload(), []);

  if (wanted && !started) setStarted(true);

  useEffect(() => {
    if (!started) return;
    let live = true;
    loadGatheringMapSpots().then(
      (loaded) => live && setSpots(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [started]);

  let status: GatheringSpotsStatus = GATHERING_SPOTS_STATUS.idle;
  if (spots) status = GATHERING_SPOTS_STATUS.ready;
  else if (failed) status = GATHERING_SPOTS_STATUS.error;
  else if (started) status = GATHERING_SPOTS_STATUS.loading;
  return { status, spots, retry };
}
