import type { MapLayerId } from "@/games/wow-forever/data/worldMap/mapLayerIds";
import type { MapLayerSource } from "@/games/wow-forever/types/mapLayers/mapLayerSource";

/** One switchable World Map layer: its toggle's words, its markers' source and colour. */
export interface MapLayerDef {
  id: MapLayerId;
  /** "Flight masters". The class trainer layer is named after the player's class instead. */
  label: string;
  source: MapLayerSource;
  /** Tailwind fill class of its markers (and the toggle's swatch). */
  markerClass: string;
  /** A short note under the toggle ("one sample spot per zone"). */
  note?: string;
}
