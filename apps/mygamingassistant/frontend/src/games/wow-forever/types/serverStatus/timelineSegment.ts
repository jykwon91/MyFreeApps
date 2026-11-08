import type { SegmentStatus } from "@/games/wow-forever/types/serverStatus/segmentStatus";

/** One stretch of a timeline bar, in epoch milliseconds (end exclusive). */
export interface TimelineSegment {
  start: number;
  end: number;
  status: SegmentStatus;
}
