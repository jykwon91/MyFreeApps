import type { MapMarks } from "@/games/wow-forever/types/mapMarks/mapMarks";

/** Marks + route a link shared, on one map — shown read-only, never mixed into the recipient's own. */
export interface SharedMarks {
  mapId: number;
  marks: MapMarks;
}
