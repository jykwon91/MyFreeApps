import type { MapMarks } from "@/games/wow-forever/types/mapMarks/mapMarks";

/** Every map's marks, keyed by uiMapID — what localStorage holds. */
export interface MapMarksStore {
  maps: Readonly<Record<number, MapMarks>>;
}
