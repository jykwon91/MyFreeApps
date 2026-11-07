import { useCallback, useState } from "react";
import { showError, showSuccess } from "@platform/ui";
import type { MapLayersState } from "@/games/wow-forever/hooks/useMapLayers";
import type { MapMarksState } from "@/games/wow-forever/hooks/useMapMarks";
import type { SharedMapViewState } from "@/games/wow-forever/hooks/useSharedMapView";
import { shareOrigin } from "@/games/wow-forever/lib/shareOrigin";
import type { MapMenuTarget } from "@/games/wow-forever/types/mapMarks/mapMenuTarget";
import type { MapViewport } from "@/games/wow-forever/types/mapViewport";
import { savedSharedMessage } from "@/games/wow-forever/worldMap/mapMarks";
import { FULL_VIEW } from "@/games/wow-forever/worldMap/mapViewport";
import { mapViewShareUrl } from "@/games/wow-forever/worldMap/mapViewShare";
import { formatMapCoords } from "@/games/wow-forever/worldMap/routeDistance";

/** The map's own viewer box (MapCanvas), where focus goes back to after the menu. */
const MAP_VIEWER_SELECTOR = "[data-map-viewer]";

interface TrackedView {
  mapId: number;
  viewport: MapViewport;
}

export interface MapMarkTools {
  menu: MapMenuTarget | null;
  openMenu: (target: MapMenuTarget) => void;
  /** Close the menu; focus goes back to the map. */
  closeMenu: () => void;
  addFromMenu: () => void;
  copyFromMenu: () => void;
  placing: boolean;
  setPlacing: (placing: boolean) => void;
  place: (x: number, y: number) => void;
  addAtCentre: () => void;
  /** "My marks" open (it opens by itself when a mark is added). */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  /** The mark just added, whose name box takes focus. */
  focusId: string | null;
  clearFocusId: () => void;
  /** Every settled zoom / pan, so a share link carries the view as it is. */
  trackView: (viewport: MapViewport) => void;
  shareUrl: () => string;
  saveShared: () => void;
}

/** The marks UI around the viewed map: the menu, "Place a mark", the open panel, and sharing / saving a view. */
export function useMapMarkTools(mapId: number, marks: MapMarksState, layers: MapLayersState, shared: SharedMapViewState): MapMarkTools {
  const [menu, setMenu] = useState<MapMenuTarget | null>(null);
  const [placing, setPlacing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [view, setView] = useState<TrackedView | null>(null);
  const viewport = view?.mapId === mapId ? view.viewport : FULL_VIEW;
  // Another map on screen (Back, a breadcrumb…): the menu's point and "Place a mark" belonged to the old one.
  const [menuMapId, setMenuMapId] = useState(mapId);
  if (menuMapId !== mapId) {
    setMenuMapId(mapId);
    setMenu(null);
    setPlacing(false);
  }

  const closeMenu = useCallback(() => {
    setMenu(null);
    document.querySelector<HTMLElement>(MAP_VIEWER_SELECTOR)?.focus({ preventScroll: true });
  }, []);

  function addAt(x: number, y: number) {
    setPlacing(false);
    const id = marks.add(x, y);
    if (id === null) {
      showError("This map has as many marks as it can hold — delete one to add another.");
      return;
    }
    setPanelOpen(true);
    setFocusId(id);
  }

  async function copyFromMenu() {
    if (!menu) return;
    const coords = formatMapCoords(menu.x, menu.y);
    closeMenu();
    try {
      await navigator.clipboard.writeText(coords);
      showSuccess(`Copied ${coords}`);
    } catch {
      showError(`Couldn't copy — the coordinates are ${coords}`);
    }
  }

  function saveShared() {
    if (!shared.shared) return;
    const result = marks.saveShared(shared.shared.mapId, shared.shared.marks);
    const message = savedSharedMessage(result);
    if (result.added > 0 || result.duplicates > 0) showSuccess(message);
    else showError(message);
    shared.dismissShared();
    setPanelOpen(true);
  }

  return {
    menu,
    openMenu: setMenu,
    closeMenu,
    addFromMenu: () => {
      if (!menu) return;
      setMenu(null);
      addAt(menu.x, menu.y);
    },
    copyFromMenu: () => void copyFromMenu(),
    placing,
    setPlacing,
    place: addAt,
    addAtCentre: () => addAt(viewport.centerX * 100, viewport.centerY * 100),
    panelOpen,
    setPanelOpen,
    focusId,
    clearFocusId: useCallback(() => setFocusId(null), []),
    trackView: useCallback((next: MapViewport) => setView({ mapId, viewport: next }), [mapId]),
    shareUrl: () =>
      mapViewShareUrl(shareOrigin(), { mapId, viewport, layers: layers.settings.layers, marks: marks.marks }),
    saveShared,
  };
}
