import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus } from "lucide-react";
import { Badge, DataTable, EmptyState, type ColumnDef, type SortingState } from "@platform/ui";
import ApplicationsSkeleton from "@/features/applications/ApplicationsSkeleton";
import AddApplicationDialog from "@/features/applications/AddApplicationDialog";
import { useListApplicationsQuery } from "@/lib/applicationsApi";
import { formatEventType, getEventTypeColor, getEventTypeSortRank } from "@/lib/event-format";
import { EMPTY_STATES } from "@/constants/empty-states";
import type { Application } from "@/types/application";

const COLUMNS: ColumnDef<Application>[] = [
  {
    id: "role_title",
    header: "Role",
    accessorKey: "role_title",
    cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span>,
  },
  {
    id: "latest_status",
    header: "Status",
    accessorKey: "latest_status",
    // Custom sort function so the order is applied → interview → offer → rejected → null
    sortingFn: (rowA, rowB) => {
      const a = getEventTypeSortRank(rowA.original.latest_status);
      const b = getEventTypeSortRank(rowB.original.latest_status);
      return a - b;
    },
    cell: ({ getValue }) => {
      const value = getValue<string | null>();
      if (value == null) {
        return <span className="text-sm text-muted-foreground">—</span>;
      }
      return <Badge label={formatEventType(value)} color={getEventTypeColor(value)} />;
    },
  },
  {
    id: "location",
    header: "Location",
    accessorFn: (row) => row.location ?? "—",
  },
  {
    id: "remote_type",
    header: "Remote",
    accessorKey: "remote_type",
    cell: ({ getValue }) => {
      const value = getValue<string>();
      const label = value === "unknown" ? "—" : value.charAt(0).toUpperCase() + value.slice(1);
      return <span className="text-sm text-muted-foreground">{label}</span>;
    },
  },
  {
    id: "applied_at",
    header: "Applied",
    accessorFn: (row) => (row.applied_at ? new Date(row.applied_at).toLocaleDateString() : "—"),
  },
  {
    id: "fit_score",
    header: "Fit",
    accessorKey: "fit_score",
    cell: ({ getValue }) => {
      const v = getValue<string | null>();
      // fit_score is string | null; "" (empty string) is falsy but not "no score" — keep === null
      return <span className="text-sm">{v === null ? "—" : `${v}%`}</span>;
    },
  },
];

export default function Applications() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useListApplicationsQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const copy = EMPTY_STATES.applications;

  function handleAddApplication() {
    setDialogOpen(true);
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <ApplicationsSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<FilePlus className="w-12 h-12 text-destructive" />}
          heading="Couldn't load applications"
          body={
            error && typeof error === "object" && "status" in error
              ? `The server returned ${(error as { status: number }).status}. Try refreshing.`
              : "Try refreshing the page."
          }
        />
      </div>
    );
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <>
        <div className="p-6">
          <EmptyState
            icon={<FilePlus className="w-12 h-12" />}
            heading={copy.heading}
            body={copy.body}
            action={{ label: copy.actionLabel, onClick: handleAddApplication }}
          />
        </div>
        <AddApplicationDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Applications</h1>
        <button
          onClick={handleAddApplication}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 min-h-[44px]"
        >
          <FilePlus size={16} />
          Add application
        </button>
      </header>

      <AddApplicationDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <DataTable<Application>
        data={items}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        onRowClick={(row) => navigate(`/applications/${row.id}`)}
        sorting={sorting}
        onSortingChange={setSorting}
      />
    </div>
  );
}
