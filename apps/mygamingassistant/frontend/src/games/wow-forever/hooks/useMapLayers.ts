import { useCallback, useState } from "react";
import { DEFAULT_MAP_LAYERS, MAP_LAYERS_STORAGE_KEY } from "@/games/wow-forever/data/worldMap/layerCatalog";
import type { MapLayerId } from "@/games/wow-forever/data/worldMap/mapLayerIds";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { MapLayerSettings } from "@/games/wow-forever/types/mapLayers/mapLayerSettings";
import {
  DEFAULT_MAP_LAYER_SETTINGS,
  parseMapLayerSettings,
  sameLayers,
  withLayers,
} from "@/games/wow-forever/worldMap/mapLayerSettings";

export interface MapLayersState {
  settings: MapLayerSettings;
  /** Switch these layers on or off (one toggle, or a group's All / None). */
  setLayers: (ids: readonly MapLayerId[], on: boolean) => void;
  setLevelFit: (on: boolean) => void;
  /** Layers back to the defaults ("Reset filters"); the level tint is kept — it's about you, not a filter. */
  reset: () => void;
  atDefaults: boolean;
}

/** Which map layers are on, remembered between visits. */
export function useMapLayers(): MapLayersState {
  const [settings, setSettings] = useState<MapLayerSettings>(() =>
    readStored(MAP_LAYERS_STORAGE_KEY, parseMapLayerSettings, DEFAULT_MAP_LAYER_SETTINGS),
  );

  const change = useCallback((patch: (prev: MapLayerSettings) => MapLayerSettings) => {
    setSettings((prev) => {
      const next = patch(prev);
      writeStored(MAP_LAYERS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const setLayers = useCallback(
    (ids: readonly MapLayerId[], on: boolean) => change((prev) => ({ ...prev, layers: withLayers(prev.layers, ids, on) })),
    [change],
  );
  const setLevelFit = useCallback((on: boolean) => change((prev) => ({ ...prev, levelFit: on })), [change]);
  const reset = useCallback(() => change((prev) => ({ ...prev, layers: DEFAULT_MAP_LAYERS })), [change]);

  return { settings, setLayers, setLevelFit, reset, atDefaults: sameLayers(settings.layers, DEFAULT_MAP_LAYERS) };
}
