import { useState } from "react";
import { Plus, Pencil, Archive } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import EmptyState from "@/shared/components/ui/EmptyState";
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useArchiveReplyTemplateMutation,
  useGetReplyTemplatesQuery,
} from "@/shared/store/inquiriesApi";
import type { ReplyTemplate } from "@/shared/types/inquiry/reply-template";
import ReplyTemplateForm from "./ReplyTemplateForm";

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

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading templates...</div>
      ) : templates.length === 0 ? (
        <EmptyState message="No templates yet. Create your first to speed up replies." />
      ) : (
        <ul className="divide-y border rounded-md">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex items-center justify-between p-3"
              data-testid={`reply-template-row-${template.id}`}
            >
              <div className="min-w-0 flex-1 pr-3">
                <div className="font-medium text-sm truncate">{template.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {template.subject_template}
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleEdit(template)}
                  data-testid={`reply-template-edit-${template.id}`}
                  aria-label={`Edit ${template.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setArchiveCandidate(template)}
                  data-testid={`reply-template-archive-${template.id}`}
                  aria-label={`Archive ${template.name}`}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

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
