import type { SegmentStatus } from "@/games/wow-forever/types/serverStatus/segmentStatus";
import type { ServerStatusPoint } from "@/games/wow-forever/types/serverStatus/serverStatusPoint";
import type { TimelineSegment } from "@/games/wow-forever/types/serverStatus/timelineSegment";

function push(segments: TimelineSegment[], start: number, end: number, status: SegmentStatus): void {
  if (end <= start) return;
  const last = segments[segments.length - 1];
  if (last && last.status === status && last.end === start) last.end = end;
  else segments.push({ start, end, status });
}

/**
 * The recorded points as stretches up to `end` (epoch ms). A point holds until the next one, but
 * never longer than `maxGapMs`: past that the recorder stopped, so the stretch is "unknown" —
 * a gap is never drawn as up or down. Nothing before the first point is returned.
 */
export function buildSegments(points: readonly ServerStatusPoint[], end: number, maxGapMs: number): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  points.forEach((point, i) => {
    const at = Date.parse(point.at);
    if (at >= end) return;
    const next = i + 1 < points.length ? Math.min(Date.parse(points[i + 1].at), end) : end;
    const held = Math.min(next, at + maxGapMs);
    push(segments, at, held, point.status);
    push(segments, held, next, "unknown");
  });
  return segments;
}

/** `segments` cut to [start, end), with "unknown" filling whatever they don't cover. */
export function clipSegments(segments: readonly TimelineSegment[], start: number, end: number): TimelineSegment[] {
  const clipped: TimelineSegment[] = [];
  let cursor = start;
  for (const segment of segments) {
    const from = Math.max(segment.start, start);
    const to = Math.min(segment.end, end);
    if (to <= from) continue;
    push(clipped, cursor, from, "unknown");
    push(clipped, from, to, segment.status);
    cursor = to;
  }
  push(clipped, cursor, end, "unknown");
  return clipped;
}

/** A ruleset's timeline bar for [start, end). */
export function rulesetTimeline(
  points: readonly ServerStatusPoint[],
  start: number,
  end: number,
  maxGapMs: number,
): TimelineSegment[] {
  return clipSegments(buildSegments(points, end, maxGapMs), start, end);
}
