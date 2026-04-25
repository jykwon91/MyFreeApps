import { useState } from "react";
import { Settings } from "lucide-react";
import {
  useGetCostSummaryQuery,
  useGetCostByUserQuery,
  useGetCostTimelineQuery,
  useGetCostThresholdsQuery,
} from "@/shared/store/costsApi";
import { cn } from "@/shared/utils/cn";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import Card from "@/shared/components/ui/Card";
import EmptyState from "@/shared/components/ui/EmptyState";
import CostCard from "@/admin/features/costs/CostCard";
import CostMonitoringSkeleton from "@/admin/features/costs/CostMonitoringSkeleton";
import ThresholdSettings from "@/admin/features/costs/ThresholdSettings";
import { formatCost, formatTokens } from "@/admin/features/costs/format";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend,
} from "recharts";
import { format, parseISO } from "date-fns";

type Period = "today" | "week" | "month";

export default function CostMonitoring() {
  const [userPeriod, setUserPeriod] = useState<Period>("today");
  const [showSettings, setShowSettings] = useState(false);
  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useGetCostSummaryQuery(undefined, {
    pollingInterval: 30000,
  });
  const { data: thresholds } = useGetCostThresholdsQuery();
  const { data: timeline, isError: timelineError } = useGetCostTimelineQuery({ days: 30 });
  const { data: users, isError: usersError } = useGetCostByUserQuery({ period: userPeriod, limit: 20 });

  if (summaryLoading) {
    return <CostMonitoringSkeleton />;
  }

  if (summaryError) {
    return (
      <div className="p-4 sm:p-8">
        <EmptyState message="Couldn't load cost data right now. Try refreshing the page." />
      </div>
    );
  }

  const dailyBudget = thresholds?.daily_budget ?? 50;
  const monthlyBudget = thresholds?.monthly_budget ?? 1000;

  return (
    <div className="p-4 sm:p-6 space-y-3 md:h-screen md:flex md:flex-col md:overflow-hidden">
      <SectionHeader
        title="Cost Monitoring"
        subtitle={`Rates: $${thresholds?.input_rate_per_million ?? 3}/M input, $${thresholds?.output_rate_per_million ?? 15}/M output`}
        actions={
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-md text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Alert threshold settings"
          >
            <Settings size={18} />
          </button>
        }
      />

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <CostCard
          label="Today"
          cost={summary?.today ?? 0}
          budget={dailyBudget}
          detail={`${formatTokens(summary?.total_tokens_today ?? 0)} tokens · ${summary?.extractions_today ?? 0} extractions`}
        />
        <CostCard
          label="This Week"
          cost={summary?.this_week ?? 0}
        />
        <CostCard
          label="This Month"
          cost={summary?.this_month ?? 0}
          budget={monthlyBudget}
        />
      </section>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        <section className="flex flex-col space-y-2 min-h-0">
          <h2 className="text-sm font-medium shrink-0">Daily Cost (Last 30 Days)</h2>
          {timelineError ? (
            <Card><p className="text-sm text-muted-foreground text-center py-4">Couldn't load timeline data</p></Card>
          ) : !timeline || timeline.length === 0 ? (
            <Card><p className="text-sm text-muted-foreground text-center py-4">No cost data recorded in the last 30 days</p></Card>
          ) : (
            <Card className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeline} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tickFormatter={(v) => format(parseISO(v), "MMM d")} className="text-xs" />
                  <YAxis tickFormatter={(v) => `$${v}`} className="text-xs" />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatCost(value), name === "input_cost" ? "Input" : "Output"]}
                    labelFormatter={(v) => {
                      const day = timeline.find((d) => d.date === v);
                      const total = day ? formatCost(day.cost) : "";
                      return `${format(parseISO(v as string), "MMM d, yyyy")} — Total: ${total}`;
                    }}
                  />
                  <Legend formatter={(v) => (v === "input_cost" ? "Input" : "Output")} />
                  <ReferenceLine y={dailyBudget} stroke="#ef4444" strokeDasharray="5 5" label="Budget" />
                  <Bar dataKey="input_cost" stackId="cost" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="output_cost" stackId="cost" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </section>

        <section className="flex flex-col space-y-2 min-h-0">
          <div className="flex items-center justify-between shrink-0">
            <h2 className="text-sm font-medium">Cost by User</h2>
            <label className="sr-only" htmlFor="cost-user-period">Period</label>
            <select
              id="cost-user-period"
              value={userPeriod}
              onChange={(e) => setUserPeriod(e.target.value as Period)}
              className="border rounded-md px-2 py-1 text-xs bg-background"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>
          {usersError ? (
            <Card><p className="text-sm text-muted-foreground text-center py-4">Couldn't load user cost data</p></Card>
          ) : users && users.length > 0 ? (
            <div className="border rounded-lg overflow-x-auto md:flex-1 md:overflow-auto md:min-h-0">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/95 backdrop-blur-sm">
                  <tr className="border-b">
                    <th className="text-left px-4 py-2 font-medium">User</th>
                    <th className="text-right px-4 py-2 font-medium">Extractions</th>
                    <th className="text-right px-4 py-2 font-medium">Tokens</th>
                    <th className="text-right px-4 py-2 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.user_id} className="border-b last:border-b-0">
                      <td className="px-4 py-2">{u.email}</td>
                      <td className="px-4 py-2 text-right">{u.extractions}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{formatTokens(u.tokens)}</td>
                      <td className={cn(
                        "px-4 py-2 text-right font-medium",
                        u.cost >= (thresholds?.per_user_daily_alert ?? 10) ? "text-red-500" : undefined,
                      )}>
                        {formatCost(u.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Card><p className="text-sm text-muted-foreground text-center py-4">No usage data for this period</p></Card>
          )}
        </section>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowSettings(false)}>
          <div className="bg-card border rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Alert Thresholds</h2>
              <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground">
                &times;
              </button>
            </div>
            <div className="p-6">
              <ThresholdSettings onSaved={() => setShowSettings(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
