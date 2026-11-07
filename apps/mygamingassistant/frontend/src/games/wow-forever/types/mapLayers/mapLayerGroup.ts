import type { MapLayerId } from "@/games/wow-forever/data/worldMap/mapLayerIds";

/** A heading in the Layers panel and the layers under it. */
export interface MapLayerGroup {
  id: string;
  label: string;
  layers: readonly MapLayerId[];
  /** Open when the panel first opens. */
  openByDefault: boolean;
}
