import type { MapStyle } from "@/games/wow-forever/types/mapStyle/mapStyle";

/** One segment of the Map / Satellite toggle. */
export interface MapStyleOption {
  value: MapStyle;
  label: string;
}
