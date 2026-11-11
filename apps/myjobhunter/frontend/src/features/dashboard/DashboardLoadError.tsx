import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@platform/ui";
import { DASHBOARD_MESSAGES as MESSAGES } from "@/constants/dashboard-messages";

interface DashboardLoadErrorProps {
  onRetry: () => void;
  isRetrying: boolean;
}

/** Shown when the board fails to load, so a failure is never mistaken for an empty board. */
export default function DashboardLoadError({ onRetry, isRetrying }: DashboardLoadErrorProps) {
  return (
    <main className="p-4 sm:p-8 space-y-6">
      <div role="alert">
        <EmptyState
          icon={<AlertTriangle className="w-12 h-12" />}
          heading={MESSAGES.loadErrorHeading}
          body={MESSAGES.loadErrorBody}
          action={{ label: MESSAGES.retry, onClick: onRetry, loading: isRetrying }}
        />
      </div>
    </main>
  );
}
