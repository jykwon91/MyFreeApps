import TimelineBar from "@/games/wow-forever/components/serverStatus/history/TimelineBar";
import { HISTORY_RANGE_MS, HISTORY_RANGE_OPTIONS } from "@/games/wow-forever/data/serverStatus/historyRanges";
import { streakLine } from "@/games/wow-forever/lib/serverStatus/streakLine";
import { rulesetTimeline } from "@/games/wow-forever/lib/serverStatus/timeline";
import { formatUptime, uptimePercent } from "@/games/wow-forever/lib/serverStatus/uptime";
import type { HistoryRange } from "@/games/wow-forever/types/serverStatus/historyRange";
import type { RulesetHistory } from "@/games/wow-forever/types/serverStatus/rulesetHistory";

interface RulesetTimelineRowProps {
  ruleset: RulesetHistory;
  range: HistoryRange;
  now: number;
  maxGapMs: number;
}

function rangeWords(range: HistoryRange): string {
  return HISTORY_RANGE_OPTIONS.find((o) => o.id === range)?.label.toLowerCase() ?? range;
}

/** A ruleset's name, how long it's been up or down, its uptime and its timeline bar. */
export default function RulesetTimelineRow({ ruleset, range, now, maxGapMs }: RulesetTimelineRowProps) {
  const start = now - HISTORY_RANGE_MS[range];
  const segments = rulesetTimeline(ruleset.points, start, now, maxGapMs);
  const uptime = uptimePercent(segments);
  const uptimeText = uptime === null ? "No data" : `${formatUptime(uptime)} up`;
  const barLabel =
    uptime === null
      ? `${ruleset.name}: no data for the ${rangeWords(range)}`
      : `${ruleset.name}: up ${formatUptime(uptime)} of the recorded time in the ${rangeWords(range)}`;
  return (
    <li className="space-y-1.5" data-testid="ruleset-history" data-slug={ruleset.slug}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
        <span className="font-medium">{ruleset.name}</span>
        <span className="text-muted-foreground">{uptimeText}</span>
      </div>
      <TimelineBar segments={segments} start={start} end={now} label={barLabel} />
      <p className="text-xs text-muted-foreground">{streakLine(ruleset, now, maxGapMs)}</p>
    </li>
  );
}
