import { useState } from "react";
import { HISTORY_RANGE_MS, OUTAGE_LIST_LIMIT, OUTAGE_LIST_RANGE } from "@/games/wow-forever/data/serverStatus/historyRanges";
import { formatDuration } from "@/games/wow-forever/lib/serverStatus/formatDuration";
import { formatLocalDateTime } from "@/games/wow-forever/lib/serverStatus/formatLocalTime";
import { listOutages } from "@/games/wow-forever/lib/serverStatus/outages";
import type { RulesetHistory } from "@/games/wow-forever/types/serverStatus/rulesetHistory";

interface OutageListProps {
  rulesets: readonly RulesetHistory[];
  now: number;
  maxGapMs: number;
}

/** Recorded outages in the last 7 days, newest first: ruleset, start, end (or ongoing) and how long. */
export default function OutageList({ rulesets, now, maxGapMs }: OutageListProps) {
  const [showAll, setShowAll] = useState(false);
  const outages = listOutages(rulesets, now - HISTORY_RANGE_MS[OUTAGE_LIST_RANGE], now, maxGapMs);
  const shown = showAll ? outages : outages.slice(0, OUTAGE_LIST_LIMIT);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Recent outages (last 7 days)</h3>
      {outages.length === 0 ? (
        <p className="text-sm text-muted-foreground">No outages recorded in the last 7 days.</p>
      ) : (
        <ul aria-label="Recent outages" className="divide-y rounded-lg border">
          {shown.map((o) => (
            <li key={`${o.slug}-${o.start}`} className="grid gap-0.5 p-3 text-sm sm:grid-cols-[8rem_1fr_auto] sm:items-baseline sm:gap-3">
              <span className="font-medium">{o.name}</span>
              <span className="text-muted-foreground">
                {formatLocalDateTime(o.start)} → {o.end === null ? "still down" : formatLocalDateTime(o.end)}
              </span>
              <span className={o.end === null ? "font-medium text-red-600 dark:text-red-400" : ""}>
                {o.end === null ? `Ongoing, ${formatDuration(now - o.start)}` : formatDuration(o.end - o.start)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {outages.length > OUTAGE_LIST_LIMIT ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="min-h-[44px] text-sm underline underline-offset-2 sm:min-h-0"
        >
          {showAll ? "Show fewer" : `Show all ${outages.length}`}
        </button>
      ) : null}
    </div>
  );
}
