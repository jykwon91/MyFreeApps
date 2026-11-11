import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Plus } from "lucide-react";
import { DataTable, EmptyState, type ColumnDef } from "@platform/ui";
import CompaniesSkeleton from "@/features/companies/CompaniesSkeleton";
import { optionalCompanyTextColumn } from "@/features/companies/optionalCompanyTextColumn";
import { companyTextSortFn } from "@/features/companies/companyTextSortFn";
import AddCompanyDialog from "@/features/companies/AddCompanyDialog";
import { useListCompaniesQuery } from "@myjobhunter/api-client/store/companiesApi";
import { EMPTY_STATES } from "@/constants/empty-states";
import type { Company } from "@myjobhunter/api-client/types/company";

const COLUMNS: ColumnDef<Company>[] = [
  {
    id: "name",
    header: "Name",
    accessorKey: "name",
    sortFn: companyTextSortFn,
    cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span>,
  },
  optionalCompanyTextColumn("primary_domain", "Domain"),
  optionalCompanyTextColumn("industry", "Industry"),
  optionalCompanyTextColumn("hq_location", "HQ"),
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
      <main className="p-4 sm:p-8 space-y-6">
        <CompaniesSkeleton />
      </main>
    );
  }

  if (isError) {
    return (
      <main className="p-4 sm:p-8 space-y-6">
        <EmptyState
          icon={<Building2 className="w-12 h-12 text-destructive" />}
          heading="Couldn't load companies"
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
            icon={<Building2 className="w-12 h-12" />}
            heading={copy.heading}
            body={copy.body}
            action={{ label: "Add a company", onClick: handleAddCompany }}
          />
        </main>
        <AddCompanyDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </>
    );
  }

  return (
    <main className="p-4 sm:p-8 space-y-6">
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
    </main>
  );
}
