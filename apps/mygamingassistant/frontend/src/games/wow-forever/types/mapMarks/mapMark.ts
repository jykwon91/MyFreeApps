import type { MapMarkStyle } from "@/games/wow-forever/data/worldMap/mapMarkStyles";

/** A spot the player marked on one map: its 0..100 map coordinates (one decimal), a label and a look. */
export interface MapMark {
  id: string;
  x: number;
  y: number;
  label: string;
  style: MapMarkStyle;
}
