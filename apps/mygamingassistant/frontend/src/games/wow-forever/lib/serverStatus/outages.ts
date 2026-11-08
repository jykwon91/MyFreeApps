import { buildSegments } from "@/games/wow-forever/lib/serverStatus/timeline";
import type { Outage } from "@/games/wow-forever/types/serverStatus/outage";
import type { RulesetHistory } from "@/games/wow-forever/types/serverStatus/rulesetHistory";

/**
 * Every recorded down stretch that overlaps [start, now), newest first. A stretch still down at `now`
 * is ongoing (`end` null); one followed by a gap ends where the recording stopped.
 */
export function listOutages(rulesets: readonly RulesetHistory[], start: number, now: number, maxGapMs: number): Outage[] {
  const outages: Outage[] = [];
  for (const ruleset of rulesets) {
    for (const segment of buildSegments(ruleset.points, now, maxGapMs)) {
      if (segment.status !== "down" || segment.end <= start) continue;
      outages.push({
        slug: ruleset.slug,
        name: ruleset.name,
        start: segment.start,
        end: segment.end >= now ? null : segment.end,
      });
    }
  }
  return outages.sort((a, b) => b.start - a.start || a.name.localeCompare(b.name));
}
