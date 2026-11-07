import type { MapMark } from "@/games/wow-forever/types/mapMarks/mapMark";

/** One map's marks and the route through some of them (mark ids, in order; a mark is in it at most once). */
export interface MapMarks {
  marks: readonly MapMark[];
  route: readonly string[];
}
