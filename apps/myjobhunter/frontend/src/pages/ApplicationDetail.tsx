import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Plus, Trash2, ExternalLink as ExternalLinkIcon } from "lucide-react";
import { Badge, showSuccess, showError, extractErrorMessage } from "@platform/ui";
import ApplicationDetailSkeleton from "@/features/applications/ApplicationDetailSkeleton";
import DocumentList from "@/features/documents/DocumentList";
import DocumentUploadDialog from "@/features/documents/DocumentUploadDialog";
import LogEventDialog from "@/features/applications/LogEventDialog";
import {
  useGetApplicationQuery,
  useDeleteApplicationMutation,
  useListApplicationEventsQuery,
} from "@/lib/applicationsApi";
import { useGetCompanyQuery } from "@/lib/companiesApi";
import type { ApplicationEvent, ApplicationEventType } from "@/types/application-event";

const EVENT_LABELS: Record<ApplicationEventType, string> = {
  applied: "Applied",
  email_received: "Email received",
  interview_scheduled: "Interview scheduled",
  interview_completed: "Interview completed",
  rejected: "Rejected",
  offer_received: "Offer received",
  withdrawn: "Withdrawn",
  ghosted: "Ghosted",
  note_added: "Note",
};

const EVENT_BADGE_COLOR: Record<
  ApplicationEventType,
  "gray" | "blue" | "yellow" | "green" | "red" | "purple"
> = {
  applied: "blue",
  email_received: "gray",
  interview_scheduled: "yellow",
  interview_completed: "yellow",
  rejected: "red",
  offer_received: "green",
  withdrawn: "gray",
  ghosted: "gray",
  note_added: "purple",
};

function deriveStatus(events: ApplicationEvent[] | undefined): ApplicationEventType | null {
  if (!events || events.length === 0) return null;
  const meaningful = events.find((e) => e.event_type !== "note_added");
  return meaningful?.event_type ?? null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function formatSalaryRange(
  min: string | null,
  max: string | null,
  currency: string,
  period: string | null,
): string {
  if (!min && !max) return "—";
  const parts: string[] = [];
  if (min) parts.push(min);
  if (min && max) parts.push("–");
  if (max && max !== min) parts.push(max);
  parts.push(currency);
  if (period) parts.push(`/ ${period}`);
  return parts.join(" ");
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
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
  const { data: eventsData } = useListApplicationEventsQuery(id ?? "", { skip: !id });
  const [deleteApplication, { isLoading: deleting }] = useDeleteApplicationMutation();
  const [logEventOpen, setLogEventOpen] = useState(false);
  const [docUploadOpen, setDocUploadOpen] = useState(false);

  const events = eventsData?.items ?? [];
  const status = deriveStatus(events);

  if (isLoading) {
    return <ApplicationDetailSkeleton />;
  }

  if (isError || !app) {
    const errorStatus =
      error && typeof error === "object" && "status" in error
        ? (error as { status: number }).status
        : null;
    return (
      <div className="p-6 flex flex-col items-center text-center gap-4 py-20">
        <p className="text-4xl font-bold text-muted-foreground">{errorStatus ?? 404}</p>
        <h1 className="text-xl font-semibold">
          {errorStatus === 404 || errorStatus === null
            ? "I couldn't find that application — it may have been deleted."
            : "Couldn't load that application."}
        </h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          The application with id{" "}
          <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{id}</code> isn&apos;t
          available.
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
    if (
      !window.confirm(
        "Delete this application? This soft-deletes — it won't appear in the list.",
      )
    ) {
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
            {status ? (
              <Badge label={EVENT_LABELS[status]} color={EVENT_BADGE_COLOR[status]} />
            ) : null}
            {app.archived ? <Badge label="Archived" color="gray" /> : null}
            {app.remote_type !== "unknown" ? (
              <Badge label={app.remote_type} color="blue" />
            ) : null}
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

      {/* Documents section */}
      <section>
        <header className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium">Documents</h2>
          <button
            onClick={() => setDocUploadOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-md hover:bg-muted"
          >
            <Plus size={12} />
            Add document
          </button>
        </header>
        <DocumentList applicationId={app.id} hideKindFilter />
        <DocumentUploadDialog
          open={docUploadOpen}
          onOpenChange={setDocUploadOpen}
          applicationId={app.id}
        />
      </section>

      {/* Timeline section */}
      <section>
        <header className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium">
            Timeline{" "}
            <span className="text-muted-foreground font-normal">({events.length})</span>
          </h2>
          <button
            onClick={() => setLogEventOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-md hover:bg-muted"
          >
            <Plus size={12} />
            Log event
          </button>
        </header>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground border rounded-lg p-3 bg-muted/30">
            No events yet. Log the first one to start tracking this application&apos;s status.
          </p>
        ) : (
          <ol className="space-y-2">
            {events.map((event) => (
              <li key={event.id} className="border rounded-lg p-3 bg-muted/20">
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    label={EVENT_LABELS[event.event_type]}
                    color={EVENT_BADGE_COLOR[event.event_type]}
                  />
                  <span className="text-xs text-muted-foreground">
                    {formatDate(event.occurred_at)}
                  </span>
                </div>
                {event.note ? (
                  <p className="text-sm mt-2 whitespace-pre-wrap">{event.note}</p>
                ) : null}
                {event.source !== "manual" ? (
                  <p className="text-xs text-muted-foreground mt-1">via {event.source}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <LogEventDialog
        applicationId={app.id}
        open={logEventOpen}
        onOpenChange={setLogEventOpen}
      />
    </div>
  );
}
