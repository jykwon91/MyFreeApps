import { formatDuration } from "@/games/wow-forever/lib/serverStatus/formatDuration";
import { formatLocalDateTime } from "@/games/wow-forever/lib/serverStatus/formatLocalTime";
import type { RulesetHistory } from "@/games/wow-forever/types/serverStatus/rulesetHistory";

/**
 * "Up for 3 d 4 h", "Up for at least 6 d", "Down since Sat, Nov 7, 2:05 PM" or "No recent data"
 * (nothing recorded, or the newest point is older than the recorder's longest gap).
 */
export function streakLine(ruleset: RulesetHistory, now: number, maxGapMs: number, timeZone?: string): string {
  const last = ruleset.points[ruleset.points.length - 1];
  if (!last || !ruleset.since || now - Date.parse(last.at) > maxGapMs) return "No recent data";
  const since = Date.parse(ruleset.since);
  const atLeast = ruleset.since_exact ? "" : "at least ";
  if (last.status === "up") return `Up for ${atLeast}${formatDuration(now - since)}`;
  return `Down since ${atLeast}${formatLocalDateTime(since, timeZone)}`;
}
