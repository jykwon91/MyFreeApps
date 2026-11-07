import type { MapLayerChoice } from "@/games/wow-forever/types/mapLayers/mapLayerChoice";

/** The Layers panel's remembered choices (localStorage `MAP_LAYERS_STORAGE_KEY`). Preferences only — never world data. */
export interface MapLayerSettings {
  layers: MapLayerChoice;
  /** Tint continent zones by how well they fit the player's level. */
  levelFit: boolean;
}
