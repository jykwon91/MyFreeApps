import { useState } from "react";
import { Plus } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useArchiveReplyTemplateMutation,
  useGetReplyTemplatesQuery,
} from "@/shared/store/inquiriesApi";
import type { ReplyTemplate } from "@/shared/types/inquiry/reply-template";
import ReplyTemplateForm from "./ReplyTemplateForm";
import ReplyTemplatesListBody from "./ReplyTemplatesListBody";
import { useReplyTemplatesListMode } from "./useReplyTemplatesListMode";

export default function ReplyTemplatesManager() {
  const { data: templates = [], isLoading } = useGetReplyTemplatesQuery();
  const [archiveTemplate, { isLoading: isArchiving }] =
    useArchiveReplyTemplateMutation();
  const [editingTemplate, setEditingTemplate] = useState<ReplyTemplate | null>(
    null,
  );
  const [showForm, setShowForm] = useState(false);
  const [archiveCandidate, setArchiveCandidate] = useState<ReplyTemplate | null>(
    null,
  );

  const listMode = useReplyTemplatesListMode({ isLoading, templates });

  function handleNew() {
    setEditingTemplate(null);
    setShowForm(true);
  }

  function handleEdit(template: ReplyTemplate) {
    setEditingTemplate(template);
    setShowForm(true);
  }

  async function handleArchive() {
    if (!archiveCandidate) return;
    try {
      await archiveTemplate(archiveCandidate.id).unwrap();
      showSuccess("Template archived.");
      setArchiveCandidate(null);
    } catch {
      showError("I couldn't archive that template. Want to try again?");
    }
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
        <Button
          variant="primary"
          size="md"
          onClick={handleNew}
          data-testid="reply-template-new-button"
        >
          <Plus className="h-4 w-4 mr-1" />
          New template
        </Button>
      </div>

      <ReplyTemplatesListBody
        mode={listMode}
        templates={templates}
        onEdit={handleEdit}
        onArchive={setArchiveCandidate}
      />

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
        open={archiveCandidate !== null}
        title="Archive this template?"
        description={
          archiveCandidate
            ? `"${archiveCandidate.name}" will be hidden from the picker. The audit history is preserved.`
            : ""
        }
        confirmLabel="Archive"
        variant="danger"
        isLoading={isArchiving}
        onConfirm={() => void handleArchive()}
        onCancel={() => setArchiveCandidate(null)}
      />
    </section>
  );
}
