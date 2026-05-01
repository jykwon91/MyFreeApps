import { useParams, Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Trash2, ExternalLink as ExternalLinkIcon } from "lucide-react";
import { Badge, showSuccess, showError, extractErrorMessage } from "@platform/ui";
import ApplicationDetailSkeleton from "@/features/applications/ApplicationDetailSkeleton";
import { useGetApplicationQuery, useDeleteApplicationMutation } from "@/lib/applicationsApi";
import { useGetCompanyQuery } from "@/lib/companiesApi";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function formatSalaryRange(min: string | null, max: string | null, currency: string, period: string | null): string {
  if (!min && !max) return "—";
  const parts: string[] = [];
  if (min) parts.push(min);
  if (min && max) parts.push("–");
  if (max && max !== min) parts.push(max);
  parts.push(currency);
  if (period) parts.push(`/ ${period}`);
  return parts.join(" ");
}

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: app, isLoading, isError, error } = useGetApplicationQuery(id ?? "", {
    skip: !id,
  });
  const { data: company } = useGetCompanyQuery(app?.company_id ?? "", {
    skip: !app?.company_id,
  });
  const [deleteApplication, { isLoading: deleting }] = useDeleteApplicationMutation();

  if (isLoading) {
    return <ApplicationDetailSkeleton />;
  }

  if (isError || !app) {
    const status = error && typeof error === "object" && "status" in error ? (error as { status: number }).status : null;
    return (
      <div className="p-6 flex flex-col items-center text-center gap-4 py-20">
        <p className="text-4xl font-bold text-muted-foreground">{status ?? 404}</p>
        <h1 className="text-xl font-semibold">
          {status === 404 || status === null
            ? "I couldn't find that application — it may have been deleted."
            : "Couldn't load that application."}
        </h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          The application with id <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{id}</code> isn&apos;t available.
        </p>
        <Link
          to="/applications"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mt-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Applications
        </Link>
      </div>
    );
  }

  async function handleDelete() {
    if (!app) return;
    if (!window.confirm("Delete this application? This soft-deletes — it won't appear in the list.")) {
      return;
    }
    try {
      await deleteApplication(app.id).unwrap();
      showSuccess("Application deleted");
      navigate("/applications");
    } catch (err) {
      showError(`Couldn't delete: ${extractErrorMessage(err)}`);
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <Link
        to="/applications"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Applications
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{app.role_title}</h1>
          <p className="text-sm text-muted-foreground">
            {company?.name ?? <span className="italic">(loading company...)</span>}
            {app.location ? ` · ${app.location}` : ""}
          </p>
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            {app.archived ? <Badge label="Archived" color="gray" /> : null}
            {app.remote_type !== "unknown" ? <Badge label={app.remote_type} color="blue" /> : null}
            {app.source ? <Badge label={app.source} color="purple" /> : null}
          </div>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border rounded-md hover:bg-destructive/10 text-destructive disabled:opacity-50"
        >
          <Trash2 size={14} />
          Delete
        </button>
      </header>

      {app.url ? (
        <div>
          <a
            href={app.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline break-all"
          >
            <ExternalLinkIcon size={14} />
            {app.url}
          </a>
        </div>
      ) : null}

      <section className="border rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <Field label="Applied" value={formatDate(app.applied_at)} />
        <Field label="Created" value={formatDate(app.created_at)} />
        <Field label="Updated" value={formatDate(app.updated_at)} />
        <Field label="Fit score" value={app.fit_score ? `${app.fit_score}%` : "—"} />
        <Field
          label="Posted salary"
          value={formatSalaryRange(
            app.posted_salary_min,
            app.posted_salary_max,
            app.posted_salary_currency,
            app.posted_salary_period,
          )}
        />
        <Field label="External ref" value={app.external_ref ?? "—"} />
      </section>

      {app.notes ? (
        <section>
          <h2 className="text-sm font-medium mb-2">Notes</h2>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground border rounded-lg p-3 bg-muted/30">
            {app.notes}
          </p>
        </section>
      ) : null}
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
