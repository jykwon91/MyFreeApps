import type { MapMarksStore } from "@/games/wow-forever/types/mapMarks/mapMarksStore";

/** What "Save to my marks" did. */
export interface SavedSharedMarks {
  store: MapMarksStore;
  /** Marks added to yours. */
  added: number;
  /** Shared marks you already had (same label and spot). */
  duplicates: number;
  /** Shared marks left out because the map (or every map) was full. */
  noRoom: number;
}
