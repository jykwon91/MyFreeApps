import type { TimelineSegment } from "@/games/wow-forever/types/serverStatus/timelineSegment";

/**
 * Share of the RECORDED time that was up, 0–100. Gaps don't count either way.
 * Null when nothing in the stretch was recorded.
 */
export function uptimePercent(segments: readonly TimelineSegment[]): number | null {
  let up = 0;
  let known = 0;
  for (const s of segments) {
    if (s.status === "unknown") continue;
    known += s.end - s.start;
    if (s.status === "up") up += s.end - s.start;
  }
  return known > 0 ? (up / known) * 100 : null;
}

/** "100%", "99.8%", "0%": one decimal, never rounded up to 100 while there was downtime. */
export function formatUptime(percent: number): string {
  if (percent >= 100) return "100%";
  const floored = Math.floor(percent * 10) / 10;
  return `${floored % 1 === 0 ? floored.toFixed(0) : floored.toFixed(1)}%`;
}
