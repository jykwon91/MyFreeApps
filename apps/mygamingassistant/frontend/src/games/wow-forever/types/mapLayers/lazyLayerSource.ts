import type { MapLayerSource } from "@/games/wow-forever/types/mapLayers/mapLayerSource";

/** Layer sources whose data is a file of its own, loaded only when wanted (their counts read "loading" until then). */
export type LazyLayerSource = Extract<MapLayerSource["kind"], "gathering" | "rares">;
