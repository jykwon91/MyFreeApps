/**
 * The Layers panel's saved choices: parsed defensively (an older or
 * hand-edited value never breaks the page) and compared to the defaults so
 * "Reset filters" knows when there's something to reset.
 */
import { DEFAULT_MAP_LAYERS } from "@/games/wow-forever/data/worldMap/layerCatalog";
import { MAP_LAYER_IDS, type MapLayerId } from "@/games/wow-forever/data/worldMap/mapLayerIds";
import type { MapLayerChoice } from "@/games/wow-forever/types/mapLayers/mapLayerChoice";
import type { MapLayerSettings } from "@/games/wow-forever/types/mapLayers/mapLayerSettings";

export const DEFAULT_MAP_LAYER_SETTINGS: MapLayerSettings = { layers: DEFAULT_MAP_LAYERS, levelFit: true };

/** A choice with `ids` switched to `on`, every other layer as it was. */
export function withLayers(choice: MapLayerChoice, ids: readonly MapLayerId[], on: boolean): MapLayerChoice {
  const next: Record<MapLayerId, boolean> = { ...choice };
  for (const id of ids) next[id] = on;
  return next;
}

/** A stored value as settings: known layers kept, unknown keys dropped, missing layers at their default. */
export function parseMapLayerSettings(raw: unknown): MapLayerSettings | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const stored = typeof r.layers === "object" && r.layers !== null ? (r.layers as Record<string, unknown>) : {};
  const layers: Record<MapLayerId, boolean> = { ...DEFAULT_MAP_LAYERS };
  for (const id of MAP_LAYER_IDS) {
    const value = stored[id];
    if (typeof value === "boolean") layers[id] = value;
  }
  const levelFit = typeof r.levelFit === "boolean" ? r.levelFit : DEFAULT_MAP_LAYER_SETTINGS.levelFit;
  return { layers, levelFit };
}

export function sameLayers(a: MapLayerChoice, b: MapLayerChoice): boolean {
  return MAP_LAYER_IDS.every((id) => a[id] === b[id]);
}
