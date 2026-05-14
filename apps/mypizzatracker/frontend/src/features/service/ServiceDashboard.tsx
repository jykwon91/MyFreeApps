import { useEffect, useMemo, useState } from "react";
import {
  Card,
  EmptyState,
  Select,
  Skeleton,
  StatusBadge,
  extractErrorMessage,
} from "@platform/ui";
import { useGetDashboardQuery } from "@/store/serviceApi";
import { useListDropsQuery } from "@/store/dropsApi";
import { SlotColumn } from "./SlotColumn";

const POLL_INTERVAL_MS = 5_000;

interface ServiceDashboardProps {
  dropId: string | null;
  onDropChange: (dropId: string) => void;
}

export function ServiceDashboard({
  dropId,
  onDropChange,
}: ServiceDashboardProps) {
  const tabHidden = useTabHidden();

  const {
    data: activeDrops,
    isLoading: isLoadingDrops,
    isError: isDropsError,
    error: dropsError,
  } = useListDropsQuery({ status: "active" });

  // Auto-select most-recent active drop if none chosen yet.
  useEffect(() => {
    if (dropId) return;
    if (!activeDrops || activeDrops.length === 0) return;
    onDropChange(activeDrops[0].id);
  }, [dropId, activeDrops, onDropChange]);

  // Resolve selected drop. If the URL ?drop_id no longer corresponds to an
  // active drop, fall back to the first active drop.
  const effectiveDropId = useMemo(() => {
    if (!activeDrops) return dropId;
    if (dropId && activeDrops.some((d) => d.id === dropId)) return dropId;
    return activeDrops[0]?.id ?? null;
  }, [activeDrops, dropId]);

  const {
    data: dashboard,
    isLoading: isLoadingDashboard,
    isFetching,
    isError: isDashboardError,
    error: dashboardError,
    refetch,
  } = useGetDashboardQuery(effectiveDropId ?? "", {
    skip: !effectiveDropId || tabHidden,
    pollingInterval: tabHidden ? 0 : POLL_INTERVAL_MS,
  });

  if (isLoadingDrops) return <DashboardSkeleton />;

  if (isDropsError) {
    return (
      <main className="p-4 sm:p-8">
        <EmptyState
          heading="Could not load drops"
          body={extractErrorMessage(dropsError) || "Please try again."}
          action={{ label: "Retry", onClick: () => refetch() }}
        />
      </main>
    );
  }

  if (!activeDrops || activeDrops.length === 0) {
    return (
      <main className="p-4 sm:p-8">
        <EmptyState
          heading="No active drop"
          body="Activate a drop on the Drops page to start service."
        />
      </main>
    );
  }

  if (!effectiveDropId) return <DashboardSkeleton />;

  return (
    <main className="p-4 sm:p-8 space-y-4 max-w-[1600px]">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">
              {dashboard?.drop.name ?? "Service"}
            </h1>
            {dashboard ? (
              <StatusBadge
                tone={dashboard.drop.status === "active" ? "success" : "neutral"}
                label={dashboard.drop.status}
              />
            ) : null}
          </div>
          {dashboard ? (
            <p className="text-sm text-muted-foreground">
              {dashboard.drop.in_progress_count} in progress -- updated{" "}
              {isFetching ? "..." : formatRelative(dashboard.server_time)}
            </p>
          ) : null}
        </div>
        {activeDrops.length > 1 ? (
          <Select
            value={effectiveDropId}
            onChange={(e) => onDropChange(e.target.value)}
            className="w-56"
            aria-label="Choose drop"
          >
            {activeDrops.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} -- {d.date}
              </option>
            ))}
          </Select>
        ) : null}
      </header>

      {isLoadingDashboard ? <DashboardSkeleton /> : null}

      {isDashboardError ? (
        <EmptyState
          heading="Could not load dashboard"
          body={extractErrorMessage(dashboardError) || "Please try again."}
          action={{ label: "Retry", onClick: () => refetch() }}
        />
      ) : null}

      {dashboard ? (
        dashboard.slots.length === 0 ? (
          <EmptyState
            heading="No slots configured"
            body="Add at least one pickup slot on the Drops page before serving."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {dashboard.slots.map((slot) => (
              <SlotColumn
                key={slot.id}
                dropId={dashboard.drop.id}
                slot={slot}
                allSlots={dashboard.slots}
                serverTime={dashboard.server_time}
                readOnly={dashboard.drop.status !== "active"}
              />
            ))}
          </div>
        )
      ) : null}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i}>
          <Skeleton className="h-5 w-24 mb-3" />
          <Skeleton className="h-20 w-full mb-2" />
          <Skeleton className="h-20 w-full" />
        </Card>
      ))}
    </div>
  );
}

function useTabHidden(): boolean {
  const [hidden, setHidden] = useState(
    () => typeof document !== "undefined" && document.visibilityState === "hidden",
  );
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return hidden;
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "just now";
  const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}
