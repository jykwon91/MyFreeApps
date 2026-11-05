import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@platform/ui";
import { ConfirmDialog } from "@platform/ui";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useGetReplyTemplatesQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import { useArchiveReplyTemplate } from "@mybookkeeper/api-client/hooks/useArchiveReplyTemplate";
import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import { ARCHIVE_FAILURES, archiveDescription, REPLY_TEMPLATE_MESSAGES as MESSAGES } from "@/shared/lib/reply-template-messages";
import ArchivedReplyTemplatesPanel from "./ArchivedReplyTemplatesPanel";
import ReplyTemplateForm from "./ReplyTemplateForm";
import ReplyTemplatesListBody from "./ReplyTemplatesListBody";
import ReplyTemplatesViewTabs from "./ReplyTemplatesViewTabs";
import { useReplyTemplatesListMode } from "./useReplyTemplatesListMode";
import { useReplyTemplatesView } from "./useReplyTemplatesView";

const PANEL_ID = "reply-templates-panel";

export default function ReplyTemplatesManager() {
  const [view, setView] = useReplyTemplatesView();
  const { data: templates = [], isLoading } = useGetReplyTemplatesQuery();
  const [editingTemplate, setEditingTemplate] = useState<ReplyTemplate | null>(
    null,
  );
  const [showForm, setShowForm] = useState(false);
  const [archiveCandidate, setArchiveCandidate] = useState<ReplyTemplate | null>(
    null,
  );

  const listMode = useReplyTemplatesListMode({ isLoading, templates });
  const { archive, isBusy: isArchiving } = useArchiveReplyTemplate((outcome, id) => {
    // The dialog may have been dismissed, or opened for another template, while this one ran.
    const closeIfStillOpen = () => setArchiveCandidate((open) => (open?.id === id ? null : open));
    if (outcome === "done" || outcome === "gone") {
      showSuccess(outcome === "done" ? MESSAGES.archived : MESSAGES.alreadyGone);
      closeIfStillOpen();
      return;
    }
    const failure = ARCHIVE_FAILURES[outcome];
    showError(failure.message);
    if (!failure.keepDialogOpen) closeIfStillOpen();
  });

  function handleNew() {
    setEditingTemplate(null);
    setShowForm(true);
  }

  function handleEdit(template: ReplyTemplate) {
    setEditingTemplate(template);
    setShowForm(true);
  }

  function handleArchive() {
    if (archiveCandidate) void archive(archiveCandidate.id);
  }

  return (
    <section
      className="space-y-4"
      data-testid="reply-templates-manager"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium">Reply templates</h2>
          <p className="text-xs text-muted-foreground">
            Pre-written replies you can pull up when an inquiry comes in.
          </p>
        </div>
        {/* A new template would never show up in the archived list beside it. */}
        {view === "active" ? (
          <Button
            variant="primary"
            size="md"
            onClick={handleNew}
            data-testid="reply-template-new-button"
          >
            <Plus className="h-4 w-4 mr-1" />
            New template
          </Button>
        ) : null}
      </div>

      <ReplyTemplatesViewTabs view={view} onChange={setView} panelId={PANEL_ID} />

      <div id={PANEL_ID} role="tabpanel" aria-labelledby={`reply-templates-tab-${view}`}>
        {view === "archived" ? (
          <ArchivedReplyTemplatesPanel onShowActive={() => setView("active")} />
        ) : (
          <ReplyTemplatesListBody
            mode={listMode}
            templates={templates}
            onEdit={handleEdit}
            onArchive={setArchiveCandidate}
          />
        )}
      </div>

      {showForm ? (
        <ReplyTemplateForm
          template={editingTemplate}
          onClose={() => {
            setShowForm(false);
            setEditingTemplate(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!archiveCandidate}
        title="Archive this template?"
        description={archiveCandidate ? archiveDescription(archiveCandidate.name) : ""}
        confirmLabel="Archive"
        variant="danger"
        isLoading={isArchiving}
        onConfirm={handleArchive}
        onCancel={() => setArchiveCandidate(null)}
      />
    </section>
  );
}
