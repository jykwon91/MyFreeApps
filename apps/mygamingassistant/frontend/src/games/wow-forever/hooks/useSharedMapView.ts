import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { MapLayersState } from "@/games/wow-forever/hooks/useMapLayers";
import type { MapZoomRestore } from "@/games/wow-forever/hooks/useMapSelection";
import { MAP_PARAM } from "@/games/wow-forever/hooks/useMapView";
import type { SharedMarks } from "@/games/wow-forever/types/mapMarks/sharedMarks";
import type { WorldMapData } from "@/games/wow-forever/types/worldMap";
import { decodeMapViewFragment, isMapViewFragment } from "@/games/wow-forever/worldMap/mapViewShare";

export interface SharedMapViewState {
  /** The marks + route a link shared, shown read-only until saved or dismissed (null = none, or the link had none). */
  shared: SharedMarks | null;
  dismissShared: () => void;
  /** The link's `#view=` couldn't be read (or names a map we don't have). */
  invalid: boolean;
  dismissInvalid: () => void;
  /** The shared zoom + pan, for the map to apply once the shared map is on screen. */
  restore: MapZoomRestore | null;
  clearRestore: () => void;
}

/**
 * Opens a "Share this view" link: the fragment is decoded (never trusted), its
 * map put in `?m=`, its layers previewed (not saved — `useMapLayers`) and its
 * zoom + pan applied; the fragment is then removed from the address so later
 * navigation doesn't carry it. The shared marks stay a separate read-only set —
 * nothing here touches the recipient's own marks.
 */
export function useSharedMapView(data: WorldMapData | null, layers: MapLayersState): SharedMapViewState {
  const { hash, pathname, search } = useLocation();
  const navigate = useNavigate();
  const [shared, setShared] = useState<SharedMarks | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [restore, setRestore] = useState<MapZoomRestore | null>(null);
  // The fragment read last, and the map it opened (null = it didn't work).
  const [opened, setOpened] = useState<{ hash: string; mapId: number | null } | null>(null);
  const { preview } = layers;

  // Read while rendering (not in an effect), so the shared map, zoom and layers arrive with the first frame.
  // `preview` sets useMapLayers' state during this render, which React allows only because both hooks
  // live in the same component (WowWorldMapPage) — keep them together.
  if (data && isMapViewFragment(hash) && opened?.hash !== hash) {
    const view = decodeMapViewFragment(hash);
    const ok = view !== null && data.maps.has(view.mapId);
    setOpened({ hash, mapId: ok ? view.mapId : null });
    setInvalid(!ok);
    // A newer link replaces what an earlier one shared, even when it doesn't work.
    setShared(ok && view.marks.marks.length > 0 ? { mapId: view.mapId, marks: view.marks } : null);
    if (ok) {
      setRestore({ mapId: view.mapId, zoom: view.viewport });
      preview(view.layers);
    }
  }
  // Fragment gone from the address: the same link opened again later is read again.
  if (opened && !isMapViewFragment(hash)) setOpened(null);

  // Then the fragment leaves the address (later navigation would drop it anyway), and the shared map goes in `?m=`.
  useEffect(() => {
    if (!opened || opened.hash !== hash) return;
    const params = new URLSearchParams(search);
    if (opened.mapId !== null) params.set(MAP_PARAM, String(opened.mapId));
    navigate({ pathname, search: `?${params.toString()}`, hash: "" }, { replace: true });
  }, [opened, hash, pathname, search, navigate]);

  return {
    shared,
    dismissShared: useCallback(() => setShared(null), []),
    invalid,
    dismissInvalid: useCallback(() => setInvalid(false), []),
    restore,
    clearRestore: useCallback(() => setRestore(null), []),
  };
}
