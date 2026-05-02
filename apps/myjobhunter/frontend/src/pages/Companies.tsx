import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Plus } from "lucide-react";
import { DataTable, EmptyState, type ColumnDef } from "@platform/ui";
import CompaniesSkeleton from "@/features/companies/CompaniesSkeleton";
import AddCompanyDialog from "@/features/companies/AddCompanyDialog";
import { useListCompaniesQuery } from "@/lib/companiesApi";
import { EMPTY_STATES } from "@/constants/empty-states";
import type { Company } from "@/types/company";

const COLUMNS: ColumnDef<Company>[] = [
  {
    id: "name",
    header: "Name",
    accessorKey: "name",
    cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span>,
  },
  {
    id: "primary_domain",
    header: "Domain",
    accessorFn: (row) => row.primary_domain ?? "—",
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">{getValue<string>()}</span>
    ),
  },
  {
    id: "industry",
    header: "Industry",
    accessorFn: (row) => row.industry ?? "—",
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">{getValue<string>()}</span>
    ),
  },
  {
    id: "hq_location",
    header: "HQ",
    accessorFn: (row) => row.hq_location ?? "—",
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">{getValue<string>()}</span>
    ),
  },
];

export default function Companies() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useListCompaniesQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const copy = EMPTY_STATES.companies;

  function handleAddCompany() {
    setDialogOpen(true);
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <CompaniesSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Building2 className="w-12 h-12 text-destructive" />}
          heading="Couldn't load companies"
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
            icon={<Building2 className="w-12 h-12" />}
            heading={copy.heading}
            body={copy.body}
            action={{ label: "Add a company", onClick: handleAddCompany }}
          />
        </div>
        <AddCompanyDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Companies</h1>
        <button
          onClick={handleAddCompany}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 min-h-[44px]"
        >
          <Plus size={16} />
          Add company
        </button>
      </header>

      <AddCompanyDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <DataTable<Company>
        data={items}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        onRowClick={(row) => navigate(`/companies/${row.id}`)}
      />
    </div>
  );
}
