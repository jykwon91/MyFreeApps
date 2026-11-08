import {
  SERVER_STATUS_HISTORY_POLLING,
  useGetServerStatusHistoryQuery,
} from "@/games/wow-forever/api/wowServerStatusApi";
import ServerStatusHistoryBody from "@/games/wow-forever/components/serverStatus/history/ServerStatusHistoryBody";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { HISTORY_RANGE_OPTIONS } from "@/games/wow-forever/data/serverStatus/historyRanges";
import { useHistoryRange } from "@/games/wow-forever/hooks/useHistoryRange";
import { useNow } from "@/games/wow-forever/hooks/useNow";
import { useWowRegion } from "@/games/wow-forever/hooks/useWowRegion";
import { localTimeZoneName } from "@/games/wow-forever/lib/serverStatus/formatLocalTime";

const CLOCK_TICK_MS = 60_000;

/** Uptime timelines per ruleset for the last day or week, plus the week's outages. Follows the saved region. */
export default function ServerStatusHistorySection() {
  const [region] = useWowRegion();
  const [range, setRange] = useHistoryRange();
  const now = useNow(CLOCK_TICK_MS);
  const { data, isLoading, isError, isFetching, refetch } = useGetServerStatusHistoryQuery(region, SERVER_STATUS_HISTORY_POLLING);
  return (
    <section aria-label="Uptime history" className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Uptime history</h2>
        <SegmentedToggle label="Time span" options={HISTORY_RANGE_OPTIONS} value={range} onChange={setRange} />
      </div>
      <ServerStatusHistoryBody
        data={data}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        onRetry={() => void refetch()}
        range={range}
        now={now}
      />
      <p className="text-xs text-muted-foreground">
        Checked every 5 minutes. Times are in your time zone ({localTimeZoneName()}). Gaps mean we couldn&apos;t check, not
        that the realm was down.
      </p>
    </section>
  );
}
