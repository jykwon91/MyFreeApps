import type { SegmentStatus } from "@/games/wow-forever/types/serverStatus/segmentStatus";

/** Timeline bar colours. The legend repeats them with words, and each bar has a text summary. */
export const SEGMENT_CLASS: Readonly<Record<SegmentStatus, string>> = {
  up: "bg-green-500",
  down: "bg-red-500",
  unknown: "bg-muted",
};

export const SEGMENT_LABEL: Readonly<Record<SegmentStatus, string>> = {
  up: "Up",
  down: "Down",
  unknown: "No data",
};

export const SEGMENT_ORDER: readonly SegmentStatus[] = ["up", "down", "unknown"];
