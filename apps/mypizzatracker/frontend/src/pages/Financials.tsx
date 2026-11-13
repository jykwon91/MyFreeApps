import { useEffect, useMemo } from "react"; // useEffect: drop_id URL sync
import { useSearchParams } from "react-router-dom";
import { EmptyState, Select, Skeleton, extractErrorMessage } from "@platform/ui";
import { useListDropsQuery } from "@/store/dropsApi";
import FinancialsBody from "@/features/financials/FinancialsBody";

export default function Financials() {
  const drops = useListDropsQuery();
  const [params, setParams] = useSearchParams();
  const dropIdParam = params.get("drop_id");

  const selectedDropId = useMemo(() => {
    if (dropIdParam) return dropIdParam;
    if (!drops.data || drops.data.length === 0) return null;
    // Default: today's active drop, fallback to most recent (already sorted
    // newest-first by the backend).
    const today = new Date().toISOString().slice(0, 10);
    const active = drops.data.find((d) => d.status === "active" && d.date === today);
    return (active ?? drops.data[0]).id;
  }, [dropIdParam, drops.data]);

  useEffect(() => {
    if (selectedDropId && !dropIdParam) {
      setParams({ drop_id: selectedDropId }, { replace: true });
    }
  }, [selectedDropId, dropIdParam, setParams]);

  if (drops.isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (drops.isError) {
    return (
      <div className="p-4">
        <EmptyState
          heading="Could not load drops"
          body={extractErrorMessage(drops.error) || "Please try again."}
          action={{ label: "Retry", onClick: () => drops.refetch() }}
        />
      </div>
    );
  }

  if (!drops.data || drops.data.length === 0) {
    return (
      <div className="p-4 rounded border bg-card text-center space-y-1">
        <p className="font-medium">No drops yet</p>
        <p className="text-sm text-muted-foreground">
          Create a drop on the Drops page to start tracking financials.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Financials</h1>
        <Select
          aria-label="Select drop"
          value={selectedDropId ?? ""}
          onChange={(e) => setParams({ drop_id: e.target.value }, { replace: true })}
          className="min-w-[12rem]"
        >
          {drops.data.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} — {d.date} ({d.status})
            </option>
          ))}
        </Select>
      </header>

      {selectedDropId ? <FinancialsBody dropId={selectedDropId} /> : null}
    </div>
  );
}
