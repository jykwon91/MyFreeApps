import type { MapStyle } from "@/games/wow-forever/types/mapStyle/mapStyle";

/** One map's Map / Satellite state, from `useSatelliteView`. */
export interface SatelliteView {
  /** This map has a satellite view: offer the toggle. */
  available: boolean;
  /** The satellite picture to put on the map (it may still be loading), or null. */
  src: string | null;
  /** The satellite picture is on screen. */
  shown: boolean;
  /** What the toggle shows as picked. */
  value: MapStyle;
  /** Satellite is picked and its picture is still downloading. */
  busy: boolean;
  /** The player asked for Satellite and it didn't load. */
  failed: boolean;
  choose: (next: MapStyle) => void;
  /** Start downloading the satellite picture before it's picked. */
  preload: () => void;
  onLoad: () => void;
  onError: () => void;
}
