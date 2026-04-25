import { useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  useGetHealthSummaryQuery,
  useGetHealthEventsQuery,
  useResolveEventMutation,
  useRetryFailedMutation,
} from "@/shared/store/healthApi";
import { useToast } from "@/shared/hooks/useToast";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import HealthSkeleton from "@/admin/features/health/HealthSkeleton";
import StatusIndicator from "@/admin/features/health/StatusIndicator";
import ActiveProblems from "@/admin/features/health/ActiveProblems";
import StatsGrid from "@/admin/features/health/StatsGrid";
import EventsSection from "@/admin/features/health/EventsSection";
import type { HealthSummary } from "@/shared/types/health/health-summary";

type SeverityFilter = "all" | "info" | "warning" | "error" | "critical";
type TypeFilter = string;

const STATUS_CONFIG: Record<HealthSummary["status"], { label: string; dotClass: string; textClass: string }> = {
  healthy: { label: "Healthy", dotClass: "bg-green-500", textClass: "text-green-700 dark:text-green-400" },
  degraded: { label: "Degraded", dotClass: "bg-yellow-500", textClass: "text-yellow-700 dark:text-yellow-400" },
  unhealthy: { label: "Unhealthy", dotClass: "bg-red-500", textClass: "text-red-700 dark:text-red-400" },
};

export default function SystemHealth() {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const { data: summary, isLoading: summaryLoading } = useGetHealthSummaryQuery(undefined, {
    pollingInterval: 30000,
  });

  const eventsParams = {
    ...(severityFilter !== "all" ? { severity: severityFilter } : {}),
    ...(typeFilter !== "all" ? { type: typeFilter } : {}),
  };
  const { data: events, isLoading: eventsLoading } = useGetHealthEventsQuery(eventsParams, {
    pollingInterval: 30000,
  });

  const [retryFailed, { isLoading: retrying }] = useRetryFailedMutation();
  const [resolveEvent, { isLoading: resolving }] = useResolveEventMutation();
  const { showSuccess, showError } = useToast();

  async function handleResolve(id: string) {
    try {
      await resolveEvent(id).unwrap();
      showSuccess("Event resolved");
    } catch {
      showError("Couldn't resolve that event");
    }
  }

  async function handleRetry() {
    try {
      const result = await retryFailed().unwrap();
      showSuccess(`Reset ${result.retried} failed document${result.retried === 1 ? "" : "s"} for retry`);
    } catch {
      showError("Couldn't retry failed documents right now");
    }
  }

  if (summaryLoading || !summary) {
    return (
      <div className="p-4 sm:p-8">
        <HealthSkeleton />
      </div>
    );
  }

  const status = summary?.status ?? "healthy";
  const statusConfig = STATUS_CONFIG[status];
  const problems = summary?.active_problems ?? [];
  const stats = summary?.stats;

  const eventTypes = Array.from(new Set((events ?? []).map((e) => e.event_type)));

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="System Health"
        subtitle="Monitor document processing and extraction status"
        actions={
          <LoadingButton
            variant="secondary"
            size="sm"
            isLoading={retrying}
            loadingText="Retrying..."
            onClick={handleRetry}
            disabled={(stats?.documents_failed ?? 0) === 0}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry Failed Documents
          </LoadingButton>
        }
      />

      <StatusIndicator status={status} config={statusConfig} />

      {problems.length > 0 && <ActiveProblems problems={problems} />}

      {stats && <StatsGrid stats={stats} />}

      <EventsSection
        events={events ?? []}
        isLoading={eventsLoading}
        eventTypes={eventTypes}
        severityFilter={severityFilter}
        typeFilter={typeFilter}
        onSeverityChange={setSeverityFilter}
        onTypeChange={setTypeFilter}
        onResolve={handleResolve}
        isResolving={resolving}
      />
    </div>
  );
}
