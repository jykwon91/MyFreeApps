import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import OutageList from "@/games/wow-forever/components/serverStatus/history/OutageList";
import RulesetTimelineRow from "@/games/wow-forever/components/serverStatus/history/RulesetTimelineRow";
import ServerStatusHistorySkeleton from "@/games/wow-forever/components/serverStatus/history/ServerStatusHistorySkeleton";
import TimelineLegend from "@/games/wow-forever/components/serverStatus/history/TimelineLegend";
import type { HistoryRange } from "@/games/wow-forever/types/serverStatus/historyRange";
import type { ServerStatusHistoryResponse } from "@/games/wow-forever/types/serverStatus/serverStatusHistoryResponse";

interface ServerStatusHistoryBodyProps {
  data: ServerStatusHistoryResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  range: HistoryRange;
  now: number;
}

/** The history's loading, error, empty and loaded states. */
export default function ServerStatusHistoryBody({ data, isLoading, isError, isFetching, onRetry, range, now }: ServerStatusHistoryBodyProps) {
  if (isLoading) return <ServerStatusHistorySkeleton />;
  if (isError || !data) {
    return <LoadErrorRetry message="Couldn't load the uptime history." onRetry={onRetry} retrying={isFetching} />;
  }
  if (data.rulesets.length === 0) {
    return <EmptyStateNote message="Nothing recorded for this region yet. We check every 5 minutes, so the history fills in from now on." />;
  }
  const maxGapMs = data.max_gap_seconds * 1000;
  return (
    <div className="space-y-4">
      <ul aria-label="Uptime by ruleset" className="space-y-4">
        {data.rulesets.map((r) => (
          <RulesetTimelineRow key={r.slug} ruleset={r} range={range} now={now} maxGapMs={maxGapMs} />
        ))}
      </ul>
      <TimelineLegend />
      <OutageList rulesets={data.rulesets} now={now} maxGapMs={maxGapMs} />
    </div>
  );
}
