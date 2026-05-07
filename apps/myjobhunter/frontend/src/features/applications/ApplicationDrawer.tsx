/**
 * Side-drawer that opens when the operator clicks a kanban card.
 *
 * URL state: opens via ``?app=<id>`` so deep-links work and back/forward
 * traversal is the obvious gesture for closing. The Dashboard page owns
 * the URL state — this component reads ``?app`` from props and emits an
 * ``onClose`` callback when the drawer wants to close.
 *
 * Sections (extracted into ``./sections/``):
 * - Header (logo + company name, role title, current-stage badge)
 * - Action row (stage selector, archive, delete, "open in full page")
 * - OverviewSection
 * - NotesSection (debounced auto-save)
 * - EventsSection
 * - DocumentsSection
 * - ContactsSection
 *
 * 404 -> "Application not found" inline (no toast; never emit the raw uuid
 * onto the DOM in the error message per the security review).
 */
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "react-router-dom";
import { Trash2, X, ExternalLink as ExternalLinkIcon, Archive } from "lucide-react";
import {
  Badge,
  ConfirmDialog,
  showSuccess,
  showError,
  extractErrorMessage,
} from "@platform/ui";
import {
  useGetApplicationQuery,
  useDeleteApplicationMutation,
  useUpdateApplicationMutation,
  useTransitionApplicationMutation,
} from "@/lib/applicationsApi";
import { useGetCompanyQuery } from "@/lib/companiesApi";
import OverviewSection from "./sections/OverviewSection";
import EventsSection from "./sections/EventsSection";
import DocumentsSection from "./sections/DocumentsSection";
import ContactsSection from "./sections/ContactsSection";
import NotesSection from "./sections/NotesSection";
import {
  KANBAN_COLUMN_LABELS,
  KANBAN_COLUMN_ORDER,
  type KanbanColumn,
} from "@/types/kanban/kanban-column";
import { columnForEventType } from "@/features/kanban/kanban-stage-mapping";
import ApplicationDetailSkeleton from "./ApplicationDetailSkeleton";

interface ApplicationDrawerProps {
  /** Application id from ``?app=`` query param. ``null`` when closed. */
  applicationId: string | null;
  onClose: () => void;
}

export default function ApplicationDrawer({
  applicationId,
  onClose,
}: ApplicationDrawerProps) {
  const open = applicationId !== null;

  function handleOpenChange(next: boolean) {
    if (!next) onClose();
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[60] data-[state=open]:animate-in data-[state=closed]:animate-out fade-in fade-out" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-[60] w-full sm:max-w-[480px] bg-card shadow-xl border-l flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out slide-in-from-right slide-out-to-right"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Application detail</Dialog.Title>
          {applicationId ? (
            <DrawerBody applicationId={applicationId} onClose={onClose} />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface DrawerBodyProps {
  applicationId: string;
  onClose: () => void;
}

function DrawerBody({ applicationId, onClose }: DrawerBodyProps) {
  const {
    data: app,
    isLoading,
    isError,
    error,
  } = useGetApplicationQuery(applicationId, {
    refetchOnFocus: true,
  });

  if (isLoading) {
    return <ApplicationDetailSkeleton />;
  }

  if (isError || !app) {
    const errorStatus =
      error && typeof error === "object" && "status" in error
        ? (error as { status: number }).status
        : null;
    const message =
      errorStatus === 404 || errorStatus === null
        ? "Application not found."
        : "Couldn't load that application.";
    return (
      <div className="p-6 flex flex-col gap-3">
        <DrawerHeader title="Not available" onClose={onClose} />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    );
  }

  return <DrawerContent application={app} onClose={onClose} />;
}

interface DrawerContentProps {
  application: NonNullable<ReturnType<typeof useGetApplicationQuery>["data"]>;
  onClose: () => void;
}

function DrawerContent({ application, onClose }: DrawerContentProps) {
  const { data: company } = useGetCompanyQuery(application.company_id, {
    skip: !application.company_id,
  });
  const [deleteApplication, { isLoading: deleting }] = useDeleteApplicationMutation();
  const [updateApplication, { isLoading: updating }] = useUpdateApplicationMutation();
  const [transitionApplication] = useTransitionApplicationMutation();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // The drawer doesn't carry latest_event_type directly (the detail
  // endpoint omits it in favour of the events list). Derive it from the
  // first stage-defining event in the events list, falling back to
  // "applied" — same logic the kanban board uses.
  const detailWithEvents = application as typeof application & {
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
    [
      "applied",
      "interview_scheduled",
      "interview_completed",
      "offer_received",
      "rejected",
      "withdrawn",
      "ghosted",
    ].includes(e.event_type),
  );
  const currentColumn: KanbanColumn = columnForEventType(stageEvent?.event_type ?? null);

  async function handleStageChange(target: KanbanColumn) {
    if (target === currentColumn) return;
    try {
      await transitionApplication({
        applicationId: application.id,
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
    try {
      await updateApplication({
        id: application.id,
        patch: { archived: !application.archived },
      }).unwrap();
      showSuccess(application.archived ? "Application restored" : "Application archived");
      if (!application.archived) onClose();
    } catch (err) {
      showError(`Couldn't archive: ${extractErrorMessage(err)}`);
    }
  }

  async function handleDelete() {
    try {
      await deleteApplication(application.id).unwrap();
      showSuccess("Application deleted");
      setConfirmDeleteOpen(false);
      onClose();
    } catch (err) {
      showError(`Couldn't delete: ${extractErrorMessage(err)}`);
      setConfirmDeleteOpen(false);
    }
  }

  return (
    <>
      <DrawerHeader
        title={application.role_title}
        subtitle={company?.name ?? null}
        logoUrl={company?.logo_url ?? null}
        currentColumn={currentColumn}
        onClose={onClose}
      />

      <div className="flex flex-wrap items-center gap-2 px-6 pb-3 border-b">
        <label className="text-xs text-muted-foreground" htmlFor="drawer-stage-select">
          Stage:
        </label>
        <select
          id="drawer-stage-select"
          value={currentColumn}
          onChange={(e) => void handleStageChange(e.target.value as KanbanColumn)}
          className="text-xs border rounded-md px-2 py-1 bg-card"
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
          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs border rounded-md hover:bg-muted disabled:opacity-50"
        >
          <Archive size={12} />
          {application.archived ? "Restore" : "Archive"}
        </button>

        <button
          type="button"
          onClick={() => setConfirmDeleteOpen(true)}
          disabled={deleting}
          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs border rounded-md hover:bg-destructive/10 text-destructive disabled:opacity-50"
        >
          <Trash2 size={12} />
          Delete
        </button>

        <Link
          to={`/applications/${application.id}`}
          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs border rounded-md hover:bg-muted ml-auto"
        >
          <ExternalLinkIcon size={12} />
          Open in full page
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        <OverviewSection application={application} />
        <NotesSection
          applicationId={application.id}
          initialValue={application.notes ?? ""}
        />
        <EventsSection applicationId={application.id} />
        <DocumentsSection applicationId={application.id} />
        <ContactsSection contacts={detailWithEvents.contacts ?? []} />
      </div>

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
    </>
  );
}

interface DrawerHeaderProps {
  title: string;
  subtitle?: string | null;
  logoUrl?: string | null;
  currentColumn?: KanbanColumn;
  onClose: () => void;
}

function DrawerHeader({
  title,
  subtitle,
  logoUrl,
  currentColumn,
  onClose,
}: DrawerHeaderProps) {
  return (
    <header className="flex items-start gap-3 px-6 py-4 border-b">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className="w-10 h-10 rounded-md object-cover bg-muted flex-shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-10 h-10 rounded-md bg-muted flex-shrink-0" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold truncate">{title}</h2>
        {subtitle ? (
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        ) : null}
        {currentColumn ? (
          <div className="mt-1.5">
            <Badge label={KANBAN_COLUMN_LABELS[currentColumn]} color="blue" />
          </div>
        ) : null}
      </div>
      <Dialog.Close asChild>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </Dialog.Close>
    </header>
  );
}
