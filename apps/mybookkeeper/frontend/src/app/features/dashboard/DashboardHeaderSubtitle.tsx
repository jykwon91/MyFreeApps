import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import type { DashboardSubtitleMode } from "@/shared/types/dashboard/dashboard-subtitle-mode";
import type { DateRange } from "@/shared/types/dashboard/date-range";
import type { HealthSummary } from "@/shared/types/health/health-summary";
import { formatCount } from "@/shared/utils/count";

export interface DashboardHeaderSubtitleProps {
  mode: DashboardSubtitleMode;
  dateRange: DateRange | undefined;
  healthSummary: HealthSummary | undefined;
}

export default function DashboardHeaderSubtitle({
  mode,
  dateRange,
  healthSummary,
}: DashboardHeaderSubtitleProps) {
  switch (mode) {
    case "date-range":
      return <>{`${dateRange!.startDate} — ${dateRange!.endDate}`}</>;
    case "health-warning":
      return (
        <Link
          to="/admin/system-health"
          className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:underline"
        >
          <AlertTriangle size={14} />
          <span>{formatCount(healthSummary!.stats?.documents_failed ?? 0, "failed document")}</span>
        </Link>
      );
    case "none":
      return undefined;
  }
}
