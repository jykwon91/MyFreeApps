import type { MapLayerId } from "@/games/wow-forever/data/worldMap/mapLayerIds";

/** Which layers are switched on, one entry per layer. */
export type MapLayerChoice = Readonly<Record<MapLayerId, boolean>>;
