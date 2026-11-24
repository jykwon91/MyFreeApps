import { format } from "date-fns";
import type { NetWorthChartRow } from "../types/net-worth/net-worth-chart-row";
import type { NetWorthHistoryPoint } from "../types/net-worth/net-worth-history-point";

/** History points as chart rows: cents to dollars, each day labelled "Nov 24". */
export function netWorthChartRows(points: readonly NetWorthHistoryPoint[]): NetWorthChartRow[] {
  return points.map((point) => ({
    day: point.day,
    label: format(new Date(`${point.day}T00:00:00`), "MMM d"),
    net: point.net_cents / 100,
    assets: point.assets_cents / 100,
    liabilities: point.liabilities_cents / 100,
  }));
}
