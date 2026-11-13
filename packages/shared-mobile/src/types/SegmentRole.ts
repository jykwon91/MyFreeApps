import type { SEGMENT_ROLE } from "../constants/segmentRole";

export type SegmentRole = (typeof SEGMENT_ROLE)[keyof typeof SEGMENT_ROLE];
