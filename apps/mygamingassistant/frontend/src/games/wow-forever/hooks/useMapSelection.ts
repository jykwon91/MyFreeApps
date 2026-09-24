import { useCallback, useEffect, useRef, useState } from "react";
import { UNZOOMED, type ZoomView } from "@/hooks/useMinimapZoomPan";
import type { MapViewState } from "@/games/wow-forever/hooks/useMapView";
import type { WorldMapData } from "@/games/wow-forever/types/worldMap";
import { scrollBehavior } from "@/games/wow-forever/lib/revealInViewport";
import type { MapFocus } from "@/games/wow-forever/worldMap/mapLayers";

/** A zoom + pan for the map canvas to put back once `mapId` is on screen. */
export interface MapZoomRestore {
  mapId: number;
  zoom: ZoomView;
}

export interface MapSelection {
  selectedPoiId: string | null;
  /** A pending "zoom to this marker" for the map. */
  focus: MapFocus | null;
  /** A pending "put the pre-selection zoom back" for the map. */
  restore: MapZoomRestore | null;
  /**
   * From the list (row click / Enter / "Directions & map"): select, open the
   * result's map and zoom to it — or, on the already-selected result, clear.
   */
  toggle: (poiId: string) => void;
  /** From the map: select and bring the result's row into view. */
  selectMarker: (poiId: string) => void;
  /**
   * Nothing selected. If the selection moved the view and the player hasn't
   * taken over since, the map goes back to exactly where it was before
   * (same `?m=`, zoom and pan); otherwise the view stays where it is.
   */
  clear: () => void;
  clearFocus: () => void;
  clearRestore: () => void;
  /** The map canvas's zoom changed (any cause) — remembered for the next snapshot. */
  trackZoom: (zoom: ZoomView) => void;
  /** The player zoomed / panned the map by hand: they've taken over the view. */
  takeControl: () => void;
}

/** The view right before a list selection moved it. */
interface ViewSnapshot {
  mapId: number;
  zoom: ZoomView;
  /** Map entries our selections pushed on the history since (undone with Back). */
  pushes: number;
  /** The map the selection put on screen — any other map means the player navigated. */
  selectedMapId: number;
}

/** A pending restore only survives while it's for the map on screen (or about to be). */
function keepIfFor(restore: MapZoomRestore | null, mapId: number | null): MapZoomRestore | null {
  if (restore?.mapId === mapId) return restore;
  return null;
}

/** Esc typed into a form field belongs to that field (closing a select, clearing an input). */
const FORM_FIELDS = "input, select, textarea";

/**
 * The chosen result, shared by the lists and the map. Selecting never
 * touches the player's saved zone or position — it only moves the view, and
 * letting go puts the view back (see `clear`). Any navigation or hand
 * zoom / pan while a result is selected hands the view to the player: the
 * snapshot is dropped and letting go leaves the map where it is.
 * Esc anywhere on the page clears a selection (the map handles its own Esc:
 * clear first, zoom out only when nothing is selected).
 */
export function useMapSelection(data: WorldMapData | null, view: MapViewState): MapSelection {
  const { mapId, goTo, back } = view;
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [restore, setRestore] = useState<MapZoomRestore | null>(null);
  const snapshot = useRef<ViewSnapshot | null>(null);
  const zoom = useRef<ZoomView>(UNZOOMED);
  const lastMapId = useRef(mapId);

  // A map change the selection didn't make is the player navigating.
  useEffect(() => {
    if (mapId === lastMapId.current) return;
    lastMapId.current = mapId;
    if (snapshot.current && mapId !== snapshot.current.selectedMapId) snapshot.current = null;
    setRestore((r) => keepIfFor(r, mapId));
  }, [mapId]);

  const clear = useCallback(() => {
    setSelectedPoiId(null);
    setFocus(null);
    const snap = snapshot.current;
    snapshot.current = null;
    if (!snap) return;
    setRestore({ mapId: snap.mapId, zoom: snap.zoom });
    back(snap.pushes);
  }, [back]);

  const toggle = useCallback(
    (poiId: string) => {
      if (poiId === selectedPoiId) {
        clear();
        return;
      }
      setSelectedPoiId(poiId);
      const poi = data?.poiById.get(poiId);
      if (!poi || !data?.maps.has(poi.zone) || mapId === null) return;
      // Selecting another result keeps the ORIGINAL view to go back to.
      const snap = snapshot.current ?? { mapId, zoom: zoom.current, pushes: 0, selectedMapId: mapId };
      const pushed = poi.zone !== mapId;
      snapshot.current = { ...snap, pushes: snap.pushes + Number(pushed), selectedMapId: poi.zone };
      setRestore(null);
      goTo(poi.zone);
      setFocus({ poiId, mapId: poi.zone, nonce: Date.now() });
    },
    [clear, data, goTo, mapId, selectedPoiId],
  );

  const selectMarker = useCallback((poiId: string) => {
    setSelectedPoiId(poiId);
    const quoted = poiId.replace(/["\\]/g, "\\$&");
    const row = document.querySelector<HTMLElement>(`[data-poi-row="${quoted}"]`);
    row?.scrollIntoView?.({ block: "nearest", behavior: scrollBehavior() });
  }, []);

  const clearFocus = useCallback(() => setFocus(null), []);
  const clearRestore = useCallback(() => setRestore(null), []);
  const trackZoom = useCallback((next: ZoomView) => {
    zoom.current = next;
  }, []);
  const takeControl = useCallback(() => {
    snapshot.current = null;
  }, []);

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

  return { selectedPoiId, focus, restore, toggle, selectMarker, clear, clearFocus, clearRestore, trackZoom, takeControl };
}
