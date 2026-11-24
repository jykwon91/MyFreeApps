import { useState } from "react";
import { Skeleton } from "@platform/ui";
import { NET_WORTH_DEFAULT_RANGE } from "@mybookkeeper/api-client/constants/netWorth";
import { useGetNetWorthHistoryQuery } from "@mybookkeeper/api-client/store/netWorthApi";
import type { NetWorthRange } from "@mybookkeeper/api-client/types/net-worth/net-worth-range";
import { netWorthChartRows } from "@mybookkeeper/api-client/utils/netWorthChartRows";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { NET_WORTH_CHART_HEIGHT_CLASS, NET_WORTH_MIN_CHART_POINTS } from "@/shared/lib/net-worth-chart";
import { NET_WORTH_MESSAGES as MSG } from "@/shared/lib/net-worth-messages";
import NetWorthHistoryChart from "./NetWorthHistoryChart";
import NetWorthRangePicker from "./NetWorthRangePicker";

/** The chart with its range picker. Switching range keeps the old line up until the new one arrives. */
export default function NetWorthHistoryCard() {
  const [range, setRange] = useState<NetWorthRange>(NET_WORTH_DEFAULT_RANGE);
  const query = useGetNetWorthHistoryQuery(range);
  const points = query.data?.points ?? [];

  return (
    <section className="bg-card border rounded-lg p-4 space-y-3" data-testid="net-worth-history">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{MSG.historyTitle}</h2>
        <NetWorthRangePicker value={range} onChange={setRange} />
      </div>
      {query.isLoading ? (
        <Skeleton className={`w-full ${NET_WORTH_CHART_HEIGHT_CLASS}`} testId="net-worth-chart-skeleton" />
      ) : null}
      {query.isError && !query.isLoading ? (
        <LoadErrorAlert message={MSG.historyLoadFailed} isRetrying={query.isFetching} onRetry={() => void query.refetch()} />
      ) : null}
      {query.isSuccess && points.length < NET_WORTH_MIN_CHART_POINTS ? (
        <p className="text-sm text-muted-foreground" data-testid="net-worth-history-empty">{MSG.historyEmpty}</p>
      ) : null}
      {query.isSuccess && points.length >= NET_WORTH_MIN_CHART_POINTS ? (
        <NetWorthHistoryChart rows={netWorthChartRows(points)} />
      ) : null}
    </section>
  );
}
