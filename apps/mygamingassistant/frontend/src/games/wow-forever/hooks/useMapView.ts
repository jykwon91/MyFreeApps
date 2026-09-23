import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import type { WorldMapData } from "@/games/wow-forever/types/worldMap";

/** `/wow-forever/map?m=1429` — the map being looked at, so back = zoom out and a view can be linked. */
export const MAP_PARAM = "m";

export interface MapViewState {
  /** The viewed map's uiMapID; null until the data loads. */
  mapId: number | null;
  /** Open a map (a new history entry, so browser back returns here). */
  goTo: (mapId: number) => void;
  /** Drop the URL's map so the view follows the player's zone again. */
  followPlayer: () => void;
}

/**
 * Which map is on screen. Browsing only changes the URL — never the player's
 * saved zone or position. Without `?m=` the view is the player's zone, else
 * the world map.
 */
export function useMapView(data: WorldMapData | null, playerZoneId: number | null): MapViewState {
  const [params, setParams] = useSearchParams();
  const requested = Number(params.get(MAP_PARAM));
  let mapId: number | null = null;
  if (data) {
    mapId = data.worldMapId;
    if (playerZoneId !== null && data.maps.has(playerZoneId)) mapId = playerZoneId;
    if (data.maps.has(requested)) mapId = requested;
  }

  const goTo = useCallback(
    (next: number) => {
      if (next === mapId) return;
      setParams((prev) => {
        const updated = new URLSearchParams(prev);
        updated.set(MAP_PARAM, String(next));
        return updated;
      });
    },
    [mapId, setParams],
  );

  const followPlayer = useCallback(() => {
    setParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        updated.delete(MAP_PARAM);
        return updated;
      },
      { replace: true },
    );
  }, [setParams]);

  return { mapId, goTo, followPlayer };
}
