import { formatCurrency } from "../../utils/currency";
import { timeAgo } from "../../utils/date";
import Card from "../ui/Card";
import ProgressBar from "../ui/ProgressBar";
import StatusBadge from "../ui/StatusBadge";
import TransparencySkeleton from "./TransparencySkeleton";
import { useTransparency } from "./useTransparency";
import { deriveBreakEven, breakEvenStatusLine } from "./breakEven";

/**
 * Platform-wide cost-transparency widget: this month's server costs vs donations
 * received, with a break-even progress bar. Self-fetches the shared, public
 * transparency endpoint. Renders nothing until the operator has configured costs,
 * so apps can ship this before any numbers exist.
 */
export default function TransparencyWidget() {
  const result = useTransparency();

  if (result.status === "loading") return <TransparencySkeleton />;

  // Read-only page — a visitor can't fix a backend outage, so stay quiet (no retry).
  if (result.status === "error") {
    return (
      <Card>
        <p className="text-center text-sm text-muted-foreground">
          Cost and donation data is temporarily unavailable.
        </p>
      </Card>
    );
  }

  const { data } = result;

  // Costs not configured yet (fresh deploy) — hide entirely rather than show "$0 of $0".
  if (!data.configured) return null;

  const donations = data.donations_cents / 100;
  const costs = data.costs_cents / 100;
  const state = deriveBreakEven(data.donations_cents, data.costs_cents);
  const statusLine = breakEvenStatusLine(state);

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-base font-medium">{data.month} — running costs</h2>
          {state.goalMet ? <StatusBadge tone="success" label="Goal met this month" /> : null}
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-muted-foreground">Donations</span>
            <span className="font-semibold tabular-nums">{formatCurrency(donations)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-muted-foreground">Server costs</span>
            <span className="font-semibold tabular-nums">{formatCurrency(costs)}</span>
          </div>
        </div>

        <ProgressBar value={state.pct} tone={state.tone} label="Monthly hosting cost coverage" />

        <p className="text-sm text-muted-foreground">{statusLine}</p>

        {data.updated_at ? (
          <p className="text-xs text-muted-foreground">
            Updated automatically — last synced {timeAgo(data.updated_at)}.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
