import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus } from "lucide-react";
import { Badge, DataTable, EmptyState, LoadMoreFooter, type ColumnDef, type SortingState } from "@platform/ui";
import ApplicationsSkeleton from "@/features/applications/ApplicationsSkeleton";
import AddApplicationDialog from "@/features/applications/AddApplicationDialog";
import { APPLIED_AT_COLUMN } from "@/features/applications/appliedAtColumn";
import { APPLICATIONS_LIST_MESSAGES } from "@/constants/applications-list-messages";
import { useApplicationsList } from "@/features/applications/useApplicationsList";
import { getEventTypeColor } from "@/lib/event-color";
import { formatEventType } from "@myjobhunter/api-client/utils/formatEventType";
import { formatFitScore } from "@myjobhunter/api-client/utils/formatFitScore";
import { formatRemoteType } from "@myjobhunter/api-client/utils/formatRemoteType";
import { DEFAULT_APPLICATIONS_TABLE_SORTING } from "@/constants/default-applications-table-sorting";
import { EMPTY_STATES } from "@/constants/empty-states";
import type { Application } from "@myjobhunter/api-client/types/application";
import type { ApplicationsFilter } from "@myjobhunter/api-client/types/application/applications-filter";

/** Every application: no company or status filter. */
const ALL_APPLICATIONS: ApplicationsFilter = {};

// Sorted on the server (see APPLICATION_COLUMN_SORT_FIELDS) so the order holds
// across pages, including status pipeline order and missing values last.

const COLUMNS: ColumnDef<Application>[] = [
  {
    id: "company_name",
    header: "Company",
    accessorFn: (row) => row.company_name ?? "—",
    sortDescFirst: false,
    cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span>,
  },
  {
    id: "role_title",
    header: "Role",
    accessorKey: "role_title",
    sortDescFirst: false,
    cell: ({ getValue }) => <span>{getValue<string>()}</span>,
  },
  {
    id: "latest_status",
    header: "Status",
    accessorFn: (row) => row.latest_status ?? undefined,
    sortDescFirst: false,
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
    sortDescFirst: false,
  },
  {
    id: "remote_type",
    header: "Remote",
    accessorKey: "remote_type",
    sortDescFirst: false,
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">{formatRemoteType(getValue<string>()) ?? "—"}</span>
    ),
  },
  APPLIED_AT_COLUMN,
  {
    id: "fit_score",
    header: "Fit",
    accessorKey: "fit_score",
    sortDescFirst: true,
    cell: ({ getValue }) => <span className="text-sm">{formatFitScore(getValue<string | null>()) ?? "—"}</span>,
  },
];

export default function Applications() {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  // The table owns its sort; this follows it so the server sorts every page the same way.
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_APPLICATIONS_TABLE_SORTING);
  const list = useApplicationsList(ALL_APPLICATIONS, sorting);
  const copy = EMPTY_STATES.applications;

  function handleAddApplication() {
    setDialogOpen(true);
  }

  if (list.isLoading) {
    return (
      <main className="p-4 sm:p-8 space-y-6">
        <ApplicationsSkeleton />
      </main>
    );
  }

  if (list.loadError !== undefined) {
    const { loadError } = list;
    return (
      <main className="p-4 sm:p-8 space-y-6">
        <EmptyState
          icon={<FilePlus className="w-12 h-12 text-destructive" />}
          heading="Couldn't load applications"
          body={
            loadError && typeof loadError === "object" && "status" in loadError
              ? `The server returned ${(loadError as { status: number }).status}. Try refreshing.`
              : "Try refreshing the page."
          }
        />
      </main>
    );
  }

  const items = list.applications;

  if (items.length === 0 && !list.isSorting) {
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
        defaultSorting={DEFAULT_APPLICATIONS_TABLE_SORTING}
        enableSortingRemoval={false}
        onSortingChange={setSorting}
        manualSorting
        loading={list.isSorting}
      />

      <LoadMoreFooter
        shown={items.length}
        total={list.total}
        hasNextPage={list.hasNextPage}
        isLoading={list.isFetchingNextPage}
        isError={list.isLoadMoreError}
        onLoadMore={list.loadMore}
        messages={APPLICATIONS_LIST_MESSAGES}
      />
    </main>
  );
}
