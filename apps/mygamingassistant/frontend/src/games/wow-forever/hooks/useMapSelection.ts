import { useCallback, useEffect, useState } from "react";
import type { WorldMapData } from "@/games/wow-forever/types/worldMap";
import { scrollBehavior } from "@/games/wow-forever/lib/revealInViewport";
import type { MapFocus } from "@/games/wow-forever/worldMap/mapLayers";

export interface MapSelection {
  selectedPoiId: string | null;
  /** A pending "zoom to this marker" for the map. */
  focus: MapFocus | null;
  /**
   * From the list (row click / Enter / "Directions & map"): select, open the
   * result's map and zoom to it — or, on the already-selected result, clear.
   */
  toggle: (poiId: string) => void;
  /** From the map: select and bring the result's row into view. */
  selectMarker: (poiId: string) => void;
  /** Nothing selected: the highlight, name label and route go; the map view stays where it is. */
  clear: () => void;
  clearFocus: () => void;
}

/** Esc typed into a form field belongs to that field (closing a select, clearing an input). */
const FORM_FIELDS = "input, select, textarea";

/**
 * The chosen result, shared by the lists and the map. Selecting never
 * touches the player's saved zone or position — it only moves the view.
 * Esc anywhere on the page clears a selection (the map handles its own Esc:
 * clear first, zoom out only when nothing is selected).
 */
export function useMapSelection(data: WorldMapData | null, openMap: (mapId: number) => void): MapSelection {
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  const clear = useCallback(() => {
    setSelectedPoiId(null);
    setFocus(null);
  }, []);

  const toggle = useCallback(
    (poiId: string) => {
      if (poiId === selectedPoiId) {
        clear();
        return;
      }
      setSelectedPoiId(poiId);
      const poi = data?.poiById.get(poiId);
      if (!poi || !data?.maps.has(poi.zone)) return;
      openMap(poi.zone);
      setFocus({ poiId, mapId: poi.zone, nonce: Date.now() });
    },
    [clear, data, openMap, selectedPoiId],
  );

  const selectMarker = useCallback((poiId: string) => {
    setSelectedPoiId(poiId);
    const quoted = poiId.replace(/["\\]/g, "\\$&");
    const row = document.querySelector<HTMLElement>(`[data-poi-row="${quoted}"]`);
    row?.scrollIntoView?.({ block: "nearest", behavior: scrollBehavior() });
  }, []);

  const clearFocus = useCallback(() => setFocus(null), []);

  useEffect(() => {
    if (selectedPoiId === null) return;
    function escape(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest(FORM_FIELDS)) return;
      clear();
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [selectedPoiId, clear]);

  return { selectedPoiId, focus, toggle, selectMarker, clear, clearFocus };
}
