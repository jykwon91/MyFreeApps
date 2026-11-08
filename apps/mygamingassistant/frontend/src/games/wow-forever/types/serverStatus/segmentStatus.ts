import type { ServerStatusValue } from "@/games/wow-forever/types/serverStatus/serverStatusValue";

/** A stretch of the timeline: a recorded status, or "unknown" where nothing was recorded. */
export type SegmentStatus = ServerStatusValue | "unknown";
