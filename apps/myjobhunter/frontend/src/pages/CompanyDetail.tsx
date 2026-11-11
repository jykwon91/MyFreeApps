import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ExternalLink as ExternalLinkIcon, Trash2 } from "lucide-react";
import { Badge, showSuccess, showError, extractErrorMessage, type SortingState } from "@platform/ui";
import CompanyDetailSkeleton from "@/features/companies/CompanyDetailSkeleton";
import CompanyResearchPanel from "@/features/companies/CompanyResearchPanel";
import CompanyApplications from "@/features/companies/CompanyApplications";
import CompanyField from "@/features/companies/CompanyField";
import { useApplicationsList } from "@/features/applications/useApplicationsList";
import { useGetCompanyQuery, useDeleteCompanyMutation } from "@myjobhunter/api-client/store/companiesApi";
import { COMPANY_APPLICATIONS_MESSAGES } from "@/constants/company-applications-messages";
import { DEFAULT_APPLICATIONS_TABLE_SORTING } from "@/constants/default-applications-table-sorting";
import { isCompanyHasApplicationsError } from "@myjobhunter/api-client/utils/isCompanyHasApplicationsError";
import { companyDeleteState } from "@myjobhunter/api-client/utils/companyDeleteState";
import { companyDomainUrl } from "@myjobhunter/api-client/utils/companyDomainUrl";

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: company, isLoading, isError, error } = useGetCompanyQuery(id ?? "", { skip: !id });
  const [deleteCompany, { isLoading: deleting }] = useDeleteCompanyMutation();
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_APPLICATIONS_TABLE_SORTING);
  const applications = useApplicationsList({ company_id: id }, sorting, !id);
  const deleteState = companyDeleteState(applications);

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
      if (isCompanyHasApplicationsError(err)) {
        showError(err.data.detail.message);
        // Applications this page didn't know about: reload them so Delete turns off and says why.
        void applications.refetch();
      } else {
        showError(`Couldn't delete: ${extractErrorMessage(err)}`);
      }
    }
  }

  if (isLoading) {
    return <CompanyDetailSkeleton />;
  }

  if (isError || !company) {
    const status = error && typeof error === "object" && "status" in error ? (error as { status: number }).status : null;
    return (
      <main className="p-4 sm:p-8 flex flex-col items-center text-center gap-4 py-20">
        <p className="text-4xl font-bold text-muted-foreground">{status ?? 404}</p>
        <h1 className="text-xl font-semibold">
          {/* status is number | null; null means no HTTP status extracted (e.g. network error) — treat same as 404 */}
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
      </main>
    );
  }

  const deleteHint =
    deleteState === "waiting"
      ? COMPANY_APPLICATIONS_MESSAGES.deleteWaiting
      : deleteState === "blocked"
        ? COMPANY_APPLICATIONS_MESSAGES.deleteBlocked
        : undefined;

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
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
              href={companyDomainUrl(company.primary_domain)}
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
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            onClick={handleDelete}
            disabled={deleting || deleteState !== "allowed"}
            title={deleteHint}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border rounded-md hover:bg-destructive/10 text-destructive disabled:opacity-50 shrink-0"
          >
            <Trash2 size={14} />
            {deleting ? "Deleting..." : "Delete"}
          </button>
          {deleteState === "blocked" ? (
            <p className="text-xs text-muted-foreground max-w-48 text-right">{COMPANY_APPLICATIONS_MESSAGES.deleteBlocked}</p>
          ) : null}
        </div>
      </header>

      <section className="border rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <CompanyField label="HQ" value={company.hq_location ?? "—"} />
        <CompanyField
          label="Created"
          value={new Date(company.created_at).toLocaleDateString()}
        />
        <CompanyField label="Domain" value={company.primary_domain ?? "—"} />
        <CompanyField label="Industry" value={company.industry ?? "—"} />
      </section>

      {company.description ? (
        <section>
          <h2 className="text-sm font-medium mb-2">Description</h2>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground border rounded-lg p-3 bg-muted/30">
            {company.description}
          </p>
        </section>
      ) : null}

      <CompanyResearchPanel companyId={company.id} />

      <CompanyApplications
        companyName={company.name}
        list={applications}
        onSortingChange={setSorting}
        onOpen={(applicationId) => navigate(`/applications/${applicationId}`)}
      />
    </main>
  );
}
