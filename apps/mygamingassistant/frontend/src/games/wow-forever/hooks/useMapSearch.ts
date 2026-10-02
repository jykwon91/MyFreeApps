import { useCallback, useMemo, useState } from "react";
import type { PlayerFaction, WorldMapData } from "@/games/wow-forever/types/worldMap";
import type { MapFit, MapMarker } from "@/games/wow-forever/worldMap/mapLayers";
import {
  fitResults,
  searchMarkers,
  viewMapSearch,
  type MapSearch,
  type MapSearchView,
} from "@/games/wow-forever/worldMap/mapSearch";
import type { PlayerLocation } from "@/games/wow-forever/worldMap/nearest";

export interface MapSearchState {
  search: MapSearch | null;
  view: MapSearchView | null;
  /** The results as markers, drawn on every map level; null with no search. */
  markers: MapMarker[] | null;
  includeOtherFaction: boolean;
  setIncludeOtherFaction: (value: boolean) => void;
  /** Show these matches and zoom the map out to all of them. */
  show: (search: MapSearch) => void;
  /** Zoom back out to every result. */
  fitAll: () => void;
  clear: () => void;
  fit: MapFit | null;
  clearFit: () => void;
}

interface MapSearchInput {
  data: WorldMapData | null;
  faction: PlayerFaction;
  player: PlayerLocation | null;
  goTo: (mapId: number) => void;
}

/** "Show all on the map" — the matches, the markers and the zoom that fits them. */
export function useMapSearch({ data, faction, player, goTo }: MapSearchInput): MapSearchState {
  const [search, setSearch] = useState<MapSearch | null>(null);
  const [includeOtherFaction, setInclude] = useState(false);
  const [fit, setFit] = useState<MapFit | null>(null);

  const view = useMemo(
    () => (data && search ? viewMapSearch(search, data, faction, player, includeOtherFaction) : null),
    [data, search, faction, player, includeOtherFaction],
  );
  const markers = useMemo(() => (view ? searchMarkers(view.results) : null), [view]);

  const fitTo = useCallback(
    (next: MapSearchView | null) => {
      const target = data && next ? fitResults(data, next.results) : null;
      if (!target) return;
      goTo(target.mapId);
      setFit(target);
    },
    [data, goTo],
  );

  const show = useCallback(
    (next: MapSearch) => {
      setSearch(next);
      setInclude(false);
      fitTo(data && viewMapSearch(next, data, faction, player, false));
    },
    [data, faction, player, fitTo],
  );

  const setIncludeOtherFaction = useCallback(
    (value: boolean) => {
      setInclude(value);
      fitTo(data && search && viewMapSearch(search, data, faction, player, value));
    },
    [data, search, faction, player, fitTo],
  );

  const fitAll = useCallback(() => fitTo(view), [fitTo, view]);
  const clear = useCallback(() => {
    setSearch(null);
    setFit(null);
  }, []);
  const clearFit = useCallback(() => setFit(null), []);

  return { search, view, markers, includeOtherFaction, setIncludeOtherFaction, show, fitAll, clear, fit, clearFit };
}
