import { Link } from "react-router-dom";
import { AlertTriangle, AlertCircle } from "lucide-react";
import type { HealthSummary } from "@/shared/types/health/health-summary";

interface Props {
  status: Exclude<HealthSummary["status"], "healthy">;
}

export default function HealthBanner({ status }: Props) {
  const isDegraded = status === "degraded";

  return (
    <div
      className={
        isDegraded
          ? "flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200"
          : "flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
      }
    >
      {isDegraded ? (
        <AlertTriangle className="h-5 w-5 shrink-0" />
      ) : (
        <AlertCircle className="h-5 w-5 shrink-0" />
      )}
      <p className="flex-1">
        {isDegraded
          ? "Some documents need attention"
          : "There are extraction problems that need your review"}
      </p>
      <Link
        to="/admin/system-health"
        className="shrink-0 font-medium underline hover:no-underline"
      >
        View details
      </Link>
    </div>
  );
}
