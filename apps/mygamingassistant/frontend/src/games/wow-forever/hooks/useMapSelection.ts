import { useCallback, useState } from "react";
import type { WorldMapData } from "@/games/wow-forever/types/worldMap";
import { scrollBehavior } from "@/games/wow-forever/lib/revealInViewport";
import type { MapFocus } from "@/games/wow-forever/worldMap/mapLayers";

export interface MapSelection {
  selectedPoiId: string | null;
  /** A pending "zoom to this marker" for the map. */
  focus: MapFocus | null;
  /** From the list: select, open the result's map and zoom to it. */
  select: (poiId: string) => void;
  /** The row's "Directions & map" button: select (as above) or close. */
  toggle: (poiId: string) => void;
  /** From the map: select and bring the result's row into view. */
  selectMarker: (poiId: string) => void;
  clearFocus: () => void;
}

/**
 * The chosen result, shared by the lists and the map. Selecting never
 * touches the player's saved zone or position — it only moves the view.
 */
export function useMapSelection(data: WorldMapData | null, openMap: (mapId: number) => void): MapSelection {
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  const select = useCallback(
    (poiId: string) => {
      setSelectedPoiId(poiId);
      const poi = data?.poiById.get(poiId);
      if (!poi || !data?.maps.has(poi.zone)) return;
      openMap(poi.zone);
      setFocus({ poiId, mapId: poi.zone, nonce: Date.now() });
    },
    [data, openMap],
  );

  const toggle = useCallback(
    (poiId: string) => {
      if (poiId === selectedPoiId) setSelectedPoiId(null);
      else select(poiId);
    },
    [select, selectedPoiId],
  );

  const selectMarker = useCallback((poiId: string) => {
    setSelectedPoiId(poiId);
    const quoted = poiId.replace(/["\\]/g, "\\$&");
    const row = document.querySelector<HTMLElement>(`[data-poi-row="${quoted}"]`);
    row?.scrollIntoView?.({ block: "nearest", behavior: scrollBehavior() });
  }, []);

  const clearFocus = useCallback(() => setFocus(null), []);

  return { selectedPoiId, focus, select, toggle, selectMarker, clearFocus };
}
