import { useState } from "react";
import {
  Button,
  EmptyState,
  Select,
  extractErrorMessage,
} from "@platform/ui";
import { Plus } from "lucide-react";
import { useListDropsQuery } from "@/store/dropsApi";
import {
  type DropStatus,
  DROP_STATUS_LABELS,
  DROP_STATUSES,
} from "@/types/drop/drop";
import CreateDropCard from "@/features/drops/CreateDropCard";
import DropCard from "@/features/drops/DropCard";
import DropsListSkeleton from "@/features/drops/DropsListSkeleton";

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All statuses" },
  ...DROP_STATUSES.map((s) => ({ value: s, label: DROP_STATUS_LABELS[s] })),
];

export default function DropsPage() {
  const [statusFilter, setStatusFilter] = useState<DropStatus | "">("");
  const { data: drops, isLoading, isError, error, refetch } = useListDropsQuery(
    statusFilter ? { status: statusFilter } : undefined,
  );
  const [showCreate, setShowCreate] = useState(false);

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-5xl">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Drops</h1>
          <p className="text-sm text-muted-foreground mt-1">
            One selling event per drop -- planning, active, or closed.
          </p>
        </div>
        <Button
          onClick={() => setShowCreate((v) => !v)}
          aria-expanded={showCreate}
        >
          <Plus className="h-4 w-4 mr-1" />
          {showCreate ? "Close" : "New drop"}
        </Button>
      </header>

      {showCreate ? (
        <CreateDropCard onCreated={() => setShowCreate(false)} />
      ) : null}

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Filter:</span>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DropStatus | "")}
          className="w-44"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? <DropsListSkeleton /> : null}
      {isError ? (
        <EmptyState
          heading="Could not load drops"
          body={extractErrorMessage(error) || "Please try again."}
          action={{ label: "Retry", onClick: () => refetch() }}
        />
      ) : null}
      {!isLoading && !isError && drops && drops.length === 0 ? (
        <EmptyState
          heading="No drops yet"
          body="Create your first drop to start planning."
          action={{ label: "New drop", onClick: () => setShowCreate(true) }}
        />
      ) : null}
      {!isLoading && drops && drops.length > 0 ? (
        <div className="space-y-3">
          {drops.map((d) => (
            <DropCard key={d.id} drop={d} />
          ))}
        </div>
      ) : null}
    </main>
  );
}
