import { useNavigate } from "react-router-dom";
import { FilePlus } from "lucide-react";
import { DataTable, EmptyState, type ColumnDef } from "@platform/ui";
import ApplicationsSkeleton from "@/features/applications/ApplicationsSkeleton";
import { useListApplicationsQuery } from "@/lib/applicationsApi";
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
      return <span className="text-sm">{v === null ? "—" : `${v}%`}</span>;
    },
  },
];

export default function Applications() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useListApplicationsQuery();
  const copy = EMPTY_STATES.applications;

  function handleAddApplication() {
    // TODO Phase 2.2: open AddApplicationDialog. For now, defer.
    console.info("AddApplicationDialog — Phase 2.2");
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
      <div className="p-6">
        <EmptyState
          icon={<FilePlus className="w-12 h-12" />}
          heading={copy.heading}
          body={copy.body}
          action={{ label: copy.actionLabel, onClick: handleAddApplication }}
        />
      </div>
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

      <DataTable<Application>
        data={items}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        onRowClick={(row) => navigate(`/applications/${row.id}`)}
      />
    </div>
  );
}
