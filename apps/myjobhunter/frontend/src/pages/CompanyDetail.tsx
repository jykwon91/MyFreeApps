import { useParams, Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ExternalLink as ExternalLinkIcon, Trash2 } from "lucide-react";
import { Badge, DataTable, showSuccess, showError, extractErrorMessage, type ColumnDef } from "@platform/ui";
import CompanyDetailSkeleton from "@/features/companies/CompanyDetailSkeleton";
import { useGetCompanyQuery, useDeleteCompanyMutation } from "@/lib/companiesApi";
import { useListApplicationsQuery } from "@/lib/applicationsApi";
import type { Application } from "@/types/application";

const APPLICATION_COLUMNS: ColumnDef<Application>[] = [
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
      const v = getValue<string>();
      return <span className="text-sm text-muted-foreground">{v === "unknown" ? "—" : v}</span>;
    },
  },
  {
    id: "applied_at",
    header: "Applied",
    accessorFn: (row) => (row.applied_at ? new Date(row.applied_at).toLocaleDateString() : "—"),
  },
];

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: company, isLoading, isError, error } = useGetCompanyQuery(id ?? "", { skip: !id });
  const { data: applicationsData } = useListApplicationsQuery();
  const [deleteCompany, { isLoading: deleting }] = useDeleteCompanyMutation();

  async function handleDelete() {
    if (!company) return;
    if (!window.confirm(`Delete "${company.name}"? This permanently removes the company and cannot be undone.`)) {
      return;
    }
    try {
      await deleteCompany(company.id).unwrap();
      showSuccess(`"${company.name}" deleted`);
      navigate("/companies");
    } catch (err) {
      showError(`Couldn't delete: ${extractErrorMessage(err)}`);
    }
  }

  if (isLoading) {
    return <CompanyDetailSkeleton />;
  }

  if (isError || !company) {
    const status = error && typeof error === "object" && "status" in error ? (error as { status: number }).status : null;
    return (
      <div className="p-6 flex flex-col items-center text-center gap-4 py-20">
        <p className="text-4xl font-bold text-muted-foreground">{status ?? 404}</p>
        <h1 className="text-xl font-semibold">
          {status === 404 || status === null
            ? "I couldn't find that company — it may have been removed."
            : "Couldn't load that company."}
        </h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          The company with id <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{id}</code> isn&apos;t available.
        </p>
        <Link
          to="/companies"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mt-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Companies
        </Link>
      </div>
    );
  }

  // Filter applications that belong to this company (client-side; backend
  // doesn't yet support ?company_id= filter on /applications).
  const applicationsForCompany = (applicationsData?.items ?? []).filter(
    (a) => a.company_id === company.id,
  );

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <Link
        to="/companies"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Companies
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{company.name}</h1>
          {company.primary_domain ? (
            <a
              href={`https://${company.primary_domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <ExternalLinkIcon size={14} />
              {company.primary_domain}
            </a>
          ) : null}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            {company.industry ? <Badge label={company.industry} color="blue" /> : null}
            {company.size_range ? <Badge label={company.size_range} color="gray" /> : null}
          </div>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border rounded-md hover:bg-destructive/10 text-destructive disabled:opacity-50 shrink-0"
        >
          <Trash2 size={14} />
          Delete
        </button>
      </header>

      <section className="border rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <Field label="HQ" value={company.hq_location ?? "—"} />
        <Field
          label="Created"
          value={new Date(company.created_at).toLocaleDateString()}
        />
        <Field label="Domain" value={company.primary_domain ?? "—"} />
        <Field label="Industry" value={company.industry ?? "—"} />
      </section>

      {company.description ? (
        <section>
          <h2 className="text-sm font-medium mb-2">Description</h2>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground border rounded-lg p-3 bg-muted/30">
            {company.description}
          </p>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-medium mb-2">
          Applications at {company.name}{" "}
          <span className="text-muted-foreground font-normal">({applicationsForCompany.length})</span>
        </h2>
        {applicationsForCompany.length === 0 ? (
          <p className="text-sm text-muted-foreground border rounded-lg p-3 bg-muted/30">
            No applications at this company yet.
          </p>
        ) : (
          <DataTable<Application>
            data={applicationsForCompany}
            columns={APPLICATION_COLUMNS}
            getRowId={(row) => row.id}
            onRowClick={(row) => navigate(`/applications/${row.id}`)}
          />
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
