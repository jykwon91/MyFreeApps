import { useCallback, useState } from "react";
import { DEFAULT_MAP_LAYERS, MAP_LAYERS_STORAGE_KEY } from "@/games/wow-forever/data/worldMap/layerCatalog";
import type { MapLayerId } from "@/games/wow-forever/data/worldMap/mapLayerIds";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { MapLayerChoice } from "@/games/wow-forever/types/mapLayers/mapLayerChoice";
import type { MapLayerSettings } from "@/games/wow-forever/types/mapLayers/mapLayerSettings";
import {
  DEFAULT_MAP_LAYER_SETTINGS,
  parseMapLayerSettings,
  sameLayers,
  withLayers,
} from "@/games/wow-forever/worldMap/mapLayerSettings";

export interface MapLayersState {
  /** What the map shows: your saved choice, or a shared view's layers while they're previewed. */
  settings: MapLayerSettings;
  /** Switch these layers on or off (one toggle, or a group's All / None). During a preview, what you see becomes yours. */
  setLayers: (ids: readonly MapLayerId[], on: boolean) => void;
  setLevelFit: (on: boolean) => void;
  /** Layers back to the defaults ("Reset filters"); the level tint is kept — it's about you, not a filter. */
  reset: () => void;
  atDefaults: boolean;
  /** A shared view's layers, shown without saving (null = showing yours). */
  previewing: boolean;
  preview: (layers: MapLayerChoice) => void;
  /** Keep the previewed layers as yours. */
  keepPreview: () => void;
  /** Back to your own layers. */
  endPreview: () => void;
}

/** Which map layers are on, remembered between visits — plus a shared view's layers, previewed and never saved unless kept. */
export function useMapLayers(): MapLayersState {
  const [saved, setSaved] = useState<MapLayerSettings>(() =>
    readStored(MAP_LAYERS_STORAGE_KEY, parseMapLayerSettings, DEFAULT_MAP_LAYER_SETTINGS),
  );
  const [previewed, setPreviewed] = useState<MapLayerChoice | null>(null);

  const change = useCallback((patch: (prev: MapLayerSettings) => MapLayerSettings) => {
    setSaved((prev) => {
      const next = patch(prev);
      writeStored(MAP_LAYERS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const setLayers = useCallback(
    (ids: readonly MapLayerId[], on: boolean) => {
      // Toggling during a preview starts from what's on screen: the player took the shared layers as theirs.
      const base = previewed;
      setPreviewed(null);
      change((prev) => ({ ...prev, layers: withLayers(base ?? prev.layers, ids, on) }));
    },
    [change, previewed],
  );
  const setLevelFit = useCallback((on: boolean) => change((prev) => ({ ...prev, levelFit: on })), [change]);
  const reset = useCallback(() => {
    setPreviewed(null);
    change((prev) => ({ ...prev, layers: DEFAULT_MAP_LAYERS }));
  }, [change]);
  const preview = useCallback((layers: MapLayerChoice) => setPreviewed(layers), []);
  const keepPreview = useCallback(() => {
    const base = previewed;
    setPreviewed(null);
    if (base) change((prev) => ({ ...prev, layers: base }));
  }, [change, previewed]);
  const endPreview = useCallback(() => setPreviewed(null), []);

  const settings = previewed ? { ...saved, layers: previewed } : saved;
  return {
    settings,
    setLayers,
    setLevelFit,
    reset,
    atDefaults: sameLayers(settings.layers, DEFAULT_MAP_LAYERS),
    previewing: previewed !== null,
    preview,
    keepPreview,
    endPreview,
  };
}
