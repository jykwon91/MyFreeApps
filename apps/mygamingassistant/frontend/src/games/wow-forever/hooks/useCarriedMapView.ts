import { useCallback, useRef, useState } from "react";
import type { MapZoomRestore } from "@/games/wow-forever/hooks/useMapSelection";
import type { MapViewport } from "@/games/wow-forever/types/mapViewport";
import { FULL_VIEW } from "@/games/wow-forever/worldMap/mapViewport";

/**
 * Keeps the player's zoom + pan across the map being remounted (theater mode swaps the panel):
 * `track` follows every view change, `carry` pins the latest one as a pending restore for the new map,
 * which the canvas applies once it's up and then `clear`s.
 */
export function useCarriedMapView(mapId: number | null, onViewChange: (view: MapViewport) => void) {
  const latest = useRef<MapViewport>(FULL_VIEW);
  const [carried, setCarried] = useState<MapZoomRestore | null>(null);

  const track = useCallback(
    (view: MapViewport) => {
      latest.current = view;
      onViewChange(view);
    },
    [onViewChange],
  );
  const carry = useCallback(() => {
    if (mapId !== null) setCarried({ mapId, zoom: latest.current });
  }, [mapId]);
  const clear = useCallback(() => setCarried(null), []);

  return { carried, track, carry, clear };
}
