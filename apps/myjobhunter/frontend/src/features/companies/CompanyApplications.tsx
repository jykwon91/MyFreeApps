import { useState, type ReactNode } from "react";
import { DataTable, LoadingButton, type ColumnDef } from "@platform/ui";
import { APPLIED_AT_COLUMN } from "@/features/applications/appliedAtColumn";
import LoadMoreApplications from "@/features/applications/LoadMoreApplications";
import { COMPANY_APPLICATIONS_MESSAGES as MESSAGES } from "@/constants/company-applications-messages";
import { DEFAULT_APPLICATIONS_TABLE_SORTING } from "@/constants/default-applications-table-sorting";
import type { Application } from "@myjobhunter/api-client/types/application";
import type { CompanyApplicationsProps } from "@/types/company/company-applications-props";

// Sorted on the server, so the order holds across pages.
const APPLICATION_COLUMNS: ColumnDef<Application>[] = [
  {
    id: "role_title",
    header: "Role",
    accessorKey: "role_title",
    sortDescFirst: false,
    cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span>,
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
    cell: ({ getValue }) => {
      const v = getValue<string>();
      return <span className="text-sm text-muted-foreground">{v === "unknown" ? "—" : v}</span>;
    },
  },
  APPLIED_AT_COLUMN,
];

/** A company's applications: skeleton while loading, an error with retry, or the paged, server-sorted table. */
export default function CompanyApplications({ companyName, list, onSortingChange, onOpen }: CompanyApplicationsProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  async function retry(): Promise<void> {
    setIsRetrying(true);
    try {
      await list.refetch();
    } finally {
      setIsRetrying(false);
    }
  }

  let body: ReactNode;
  if (list.isLoading) {
    // The table's own skeleton: same columns as the loaded table, so nothing shifts.
    body = (
      <div aria-busy="true" aria-label={MESSAGES.loading}>
        <DataTable<Application> data={[]} columns={APPLICATION_COLUMNS} loading loadingRowCount={3} />
      </div>
    );
  } else if (list.loadError !== undefined) {
    body = (
      <div className="flex flex-col items-start gap-2 border rounded-lg p-3 bg-muted/30">
        <p role="alert" className="text-sm text-destructive">
          {MESSAGES.couldntLoad}
        </p>
        <LoadingButton variant="secondary" isLoading={isRetrying} loadingText={MESSAGES.retrying} onClick={() => void retry()} className="min-h-[44px]">
          {MESSAGES.tryAgain}
        </LoadingButton>
      </div>
    );
  } else if (list.applications.length === 0 && !list.isSorting) {
    body = <p className="text-sm text-muted-foreground border rounded-lg p-3 bg-muted/30">{MESSAGES.none}</p>;
  } else {
    body = (
      <>
        <DataTable<Application>
          data={list.applications}
          columns={APPLICATION_COLUMNS}
          getRowId={(row) => row.id}
          onRowClick={(row) => onOpen(row.id)}
          defaultSorting={DEFAULT_APPLICATIONS_TABLE_SORTING}
          enableSortingRemoval={false}
          onSortingChange={onSortingChange}
          manualSorting
          loading={list.isSorting}
        />
        <LoadMoreApplications
          shown={list.applications.length}
          total={list.total}
          hasNextPage={list.hasNextPage}
          isLoading={list.isFetchingNextPage}
          isError={list.isLoadMoreError}
          onLoadMore={list.loadMore}
        />
      </>
    );
  }

  const isLoaded = !list.isLoading && list.loadError === undefined;
  return (
    <section>
      <h2 className="text-sm font-medium mb-2">
        {MESSAGES.heading(companyName)}
        {isLoaded ? (
          <>
            {" "}
            <span className="text-muted-foreground font-normal">({list.total})</span>
          </>
        ) : null}
      </h2>
      {body}
    </section>
  );
}
