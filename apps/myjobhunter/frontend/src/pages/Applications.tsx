import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus } from "lucide-react";
import { Badge, DataTable, EmptyState, type ColumnDef, type SortingState } from "@platform/ui";
import ApplicationsSkeleton from "@/features/applications/ApplicationsSkeleton";
import AddApplicationDialog from "@/features/applications/AddApplicationDialog";
import { APPLIED_AT_COLUMN } from "@/features/applications/appliedAtColumn";
import { useListApplicationsQuery } from "@myjobhunter/api-client/store/applicationsApi";
import { getEventTypeColor } from "@/lib/event-color";
import { formatEventType } from "@myjobhunter/api-client/utils/formatEventType";
import { formatFitScore } from "@myjobhunter/api-client/utils/formatFitScore";
import { formatRemoteType } from "@myjobhunter/api-client/utils/formatRemoteType";
import { getEventTypeSortRank } from "@myjobhunter/api-client/utils/getEventTypeSortRank";
import { EMPTY_STATES } from "@/constants/empty-states";
import type { Application } from "@myjobhunter/api-client/types/application";

const COLUMNS: ColumnDef<Application>[] = [
  {
    id: "company_name",
    header: "Company",
    accessorFn: (row) => row.company_name ?? "—",
    cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span>,
  },
  {
    id: "role_title",
    header: "Role",
    accessorKey: "role_title",
    cell: ({ getValue }) => <span>{getValue<string>()}</span>,
  },
  {
    id: "latest_status",
    header: "Status",
    // No status reads as undefined so `sortUndefined: "last"` keeps it last both ways.
    accessorFn: (row) => row.latest_status ?? undefined,
    sortUndefined: "last",
    // Pipeline order: applied → interview → offer → rejected.
    sortFn: (rowA, rowB) =>
      getEventTypeSortRank(rowA.original.latest_status) - getEventTypeSortRank(rowB.original.latest_status),
    cell: ({ row }) => {
      const value = row.original.latest_status;
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
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">{formatRemoteType(getValue<string>()) ?? "—"}</span>
    ),
  },
  APPLIED_AT_COLUMN,
  {
    id: "fit_score",
    header: "Fit",
    accessorKey: "fit_score",
    cell: ({ getValue }) => <span className="text-sm">{formatFitScore(getValue<string | null>()) ?? "—"}</span>,
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
      <main className="p-4 sm:p-8 space-y-6">
        <ApplicationsSkeleton />
      </main>
    );
  }

  if (isError) {
    return (
      <main className="p-4 sm:p-8 space-y-6">
        <EmptyState
          icon={<FilePlus className="w-12 h-12 text-destructive" />}
          heading="Couldn't load applications"
          body={
            error && typeof error === "object" && "status" in error
              ? `The server returned ${(error as { status: number }).status}. Try refreshing.`
              : "Try refreshing the page."
          }
        />
      </main>
    );
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <>
        <main className="p-4 sm:p-8 space-y-6">
          <EmptyState
            icon={<FilePlus className="w-12 h-12" />}
            heading={copy.heading}
            body={copy.body}
            action={{ label: copy.actionLabel, onClick: handleAddApplication }}
          />
        </main>
        <AddApplicationDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </>
    );
  }

  return (
    <main className="p-4 sm:p-8 space-y-6">
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
    </main>
  );
}
