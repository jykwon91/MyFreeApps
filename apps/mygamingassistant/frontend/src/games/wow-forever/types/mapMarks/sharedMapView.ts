import type { MapLayerChoice } from "@/games/wow-forever/types/mapLayers/mapLayerChoice";
import type { MapMarks } from "@/games/wow-forever/types/mapMarks/mapMarks";
import type { MapViewport } from "@/games/wow-forever/types/mapViewport";

/** What a "Share this view" link recreates: the map, its zoom and centre, the layers, and the sender's marks + route on that map. */
export interface SharedMapView {
  mapId: number;
  viewport: MapViewport;
  layers: MapLayerChoice;
  marks: MapMarks;
}
