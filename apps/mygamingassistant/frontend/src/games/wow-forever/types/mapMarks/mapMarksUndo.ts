import type { MapMarks } from "@/games/wow-forever/types/mapMarks/mapMarks";

/** What "Undo" puts back after a mark is deleted or a route cleared: that map's marks as they were. */
export interface MapMarksUndo {
  mapId: number;
  marks: MapMarks;
  /** "Deleted “Hogger”" / "Route cleared". */
  message: string;
}
