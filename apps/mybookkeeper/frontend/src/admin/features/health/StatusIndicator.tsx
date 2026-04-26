import { cn } from "@/shared/utils/cn";
import type { HealthSummary } from "@/shared/types/health/health-summary";

interface StatusIndicatorProps {
  status: HealthSummary["status"];
  config: { label: string; dotClass: string; textClass: string };
}

export default function StatusIndicator({ status, config }: StatusIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-3 w-3 rounded-full", config.dotClass, status !== "healthy" && "animate-pulse")} />
      <span className={cn("text-sm font-medium", config.textClass)}>{config.label}</span>
    </div>
  );
}
