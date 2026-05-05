import type { HealthSummary } from "@/shared/types/health/health-summary";
import type { DateRange } from "@/shared/types/dashboard/date-range";
import type { DashboardSubtitleMode } from "@/shared/types/dashboard/dashboard-subtitle-mode";
import type { DashboardActionsMode } from "@/shared/types/dashboard/dashboard-actions-mode";

interface UseDashboardHeaderModeArgs {
  dateRange: DateRange | undefined;
  healthSummary: HealthSummary | undefined;
  byMonthLength: number;
}

export interface DashboardHeaderMode {
  subtitle: DashboardSubtitleMode;
  actions: DashboardActionsMode;
}

/**
 * Resolves the Dashboard page header's subtitle and actions render modes
 * from the current state. Replaces two 3-branch stacked ternaries with flat
 * switches in the consuming components.
 */
export function useDashboardHeaderMode({
  dateRange,
  healthSummary,
  byMonthLength,
}: UseDashboardHeaderModeArgs): DashboardHeaderMode {
  const subtitle: DashboardSubtitleMode = dateRange
    ? "date-range"
    : healthSummary && healthSummary.status !== "healthy"
      ? "health-warning"
      : "none";

  const actions: DashboardActionsMode = dateRange
    ? "reset"
    : byMonthLength > 0
      ? "hint"
      : "none";

  return { subtitle, actions };
}
