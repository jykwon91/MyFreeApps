import type { MapLayerId } from "@/games/wow-forever/data/worldMap/mapLayerIds";

/** Markers per layer on the viewed map; null while a layer's data is still loading. */
export type LayerCounts = Readonly<Record<MapLayerId, number | null>>;
