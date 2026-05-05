import type { DashboardActionsMode } from "@/shared/types/dashboard/dashboard-actions-mode";

export interface DashboardHeaderActionsProps {
  mode: DashboardActionsMode;
  onResetDateRange: () => void;
}

export default function DashboardHeaderActions({
  mode,
  onResetDateRange,
}: DashboardHeaderActionsProps) {
  switch (mode) {
    case "reset":
      return (
        <button
          onClick={onResetDateRange}
          className="text-sm text-primary hover:underline font-medium"
        >
          Reset to all time
        </button>
      );
    case "hint":
      return (
        <span className="text-xs text-muted-foreground">
          Drag across months to filter
        </span>
      );
    case "none":
      return undefined;
  }
}
