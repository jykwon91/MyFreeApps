/**
 * Full-page application detail. The drawer is the primary surface now —
 * this page exists for deep-links from email/notifications and the
 * "Open in full page" affordance in the drawer header.
 *
 * Composes the same sections the drawer uses so the two surfaces stay in
 * sync. Bigger viewport gets the same content but laid out wider.
 */
import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Trash2, Archive } from "lucide-react";
import {
  Badge,
  ConfirmDialog,
  showSuccess,
  showError,
  extractErrorMessage,
} from "@platform/ui";
import ApplicationDetailSkeleton from "@/features/applications/ApplicationDetailSkeleton";
import OverviewSection from "@/features/applications/sections/OverviewSection";
import EventsSection from "@/features/applications/sections/EventsSection";
import DocumentsSection from "@/features/applications/sections/DocumentsSection";
import ContactsSection from "@/features/applications/sections/ContactsSection";
import NotesSection from "@/features/applications/sections/NotesSection";
import {
  useGetApplicationQuery,
  useDeleteApplicationMutation,
  useUpdateApplicationMutation,
  useTransitionApplicationMutation,
} from "@/lib/applicationsApi";
import { useGetCompanyQuery } from "@/lib/companiesApi";
import { columnForEventType } from "@/features/kanban/kanban-stage-mapping";
import {
  KANBAN_COLUMN_LABELS,
  KANBAN_COLUMN_ORDER,
  type KanbanColumn,
} from "@/types/kanban/kanban-column";

const STAGE_DEFINING_TYPES = [
  "applied",
  "interview_scheduled",
  "interview_completed",
  "offer_received",
  "rejected",
  "withdrawn",
  "ghosted",
];

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
  const [updateApplication, { isLoading: updating }] = useUpdateApplicationMutation();
  const [transitionApplication] = useTransitionApplicationMutation();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  if (isLoading) {
    return <ApplicationDetailSkeleton />;
  }

  if (isError || !app) {
    const errorStatus =
      error && typeof error === "object" && "status" in error
        ? (error as { status: number }).status
        : null;
    return (
      <main className="p-4 sm:p-8 flex flex-col items-center text-center gap-4 py-20">
        <p className="text-4xl font-bold text-muted-foreground">{errorStatus ?? 404}</p>
        <h1 className="text-xl font-semibold">
          {errorStatus === 404 || errorStatus === null
            ? "I couldn't find that application — it may have been deleted."
            : "Couldn't load that application."}
        </h1>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mt-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to dashboard
        </Link>
      </main>
    );
  }

  // Derive the current kanban column from the events list (eager-loaded
  // by the detail endpoint).
  const detailWithEvents = app as typeof app & {
    events?: { event_type: string; occurred_at: string }[];
    contacts?: {
      id: string;
      name: string | null;
      email: string | null;
      linkedin_url: string | null;
      role: string;
      notes: string | null;
    }[];
  };
  const stageEvent = (detailWithEvents.events ?? []).find((e: { event_type: string }) =>
    STAGE_DEFINING_TYPES.includes(e.event_type),
  );
  const currentColumn: KanbanColumn = columnForEventType(stageEvent?.event_type ?? null);

  async function handleStageChange(target: KanbanColumn) {
    if (!app || target === currentColumn) return;
    try {
      await transitionApplication({
        applicationId: app.id,
        target_column: target,
        idempotency_key:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }).unwrap();
      showSuccess(`Moved to ${KANBAN_COLUMN_LABELS[target]}`);
    } catch (err) {
      showError(`Couldn't move: ${extractErrorMessage(err)}`);
    }
  }

  async function handleArchive() {
    if (!app) return;
    try {
      await updateApplication({
        id: app.id,
        patch: { archived: !app.archived },
      }).unwrap();
      showSuccess(app.archived ? "Application restored" : "Application archived");
    } catch (err) {
      showError(`Couldn't archive: ${extractErrorMessage(err)}`);
    }
  }

  async function handleDelete() {
    if (!app) return;
    try {
      await deleteApplication(app.id).unwrap();
      showSuccess("Application deleted");
      setConfirmDeleteOpen(false);
      navigate("/dashboard");
    } catch (err) {
      showError(`Couldn't delete: ${extractErrorMessage(err)}`);
      setConfirmDeleteOpen(false);
    }
  }

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to dashboard
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{app.role_title}</h1>
          <p className="text-sm text-muted-foreground">
            {company?.name ?? <span className="italic">(loading company...)</span>}
          </p>
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <Badge label={KANBAN_COLUMN_LABELS[currentColumn]} color="blue" />
            {app.archived ? <Badge label="Archived" color="gray" /> : null}
            {app.remote_type !== "unknown" ? (
              <Badge label={app.remote_type} color="blue" />
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={currentColumn}
            onChange={(e) => void handleStageChange(e.target.value as KanbanColumn)}
            className="text-xs border rounded-md px-2 py-1 bg-card"
            aria-label="Change stage"
          >
            {KANBAN_COLUMN_ORDER.map((col) => (
              <option key={col} value={col}>
                {KANBAN_COLUMN_LABELS[col]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleArchive()}
            disabled={updating}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border rounded-md hover:bg-muted disabled:opacity-50"
          >
            <Archive size={14} />
            {app.archived ? "Restore" : "Archive"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border rounded-md hover:bg-destructive/10 text-destructive disabled:opacity-50"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </header>

      <OverviewSection application={app} />
      <NotesSection applicationId={app.id} initialValue={app.notes ?? ""} />
      <EventsSection applicationId={app.id} />
      <DocumentsSection applicationId={app.id} />
      <ContactsSection contacts={detailWithEvents.contacts ?? []} />

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete this application?"
        description="This soft-deletes the application — it won't appear in the kanban or list. The data is retained for audit."
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </main>
  );
}
