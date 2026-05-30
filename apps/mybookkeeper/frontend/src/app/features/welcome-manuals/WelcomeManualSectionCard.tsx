import { forwardRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { LoadingButton, ConfirmDialog } from "@platform/ui";
import FormField from "@/shared/components/ui/FormField";
import Markdown from "@/shared/components/ui/Markdown";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useDeleteSectionMutation } from "@/shared/store/welcomeManualsApi";
import type { WelcomeManualSectionResponse } from "@/shared/types/welcome-manual/welcome-manual-section-response";
import WelcomeManualSectionImageManager from "./WelcomeManualSectionImageManager";
import { useSectionEditor } from "./useSectionEditor";

export interface WelcomeManualSectionCardProps {
  manualId: string;
  section: WelcomeManualSectionResponse;
}

const BODY_PLACEHOLDER = "Add instructions for guests…";

const WelcomeManualSectionCard = forwardRef<HTMLElement, WelcomeManualSectionCardProps>(
  function WelcomeManualSectionCard({ manualId, section }, forwardedRef) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: section.id,
    });
    const [deleteSection] = useDeleteSectionMutation();
    const [confirmDelete, setConfirmDelete] = useState(false);
    const editor = useSectionEditor({ manualId, section });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.6 : 1,
    };

    function setRefs(node: HTMLElement | null) {
      setNodeRef(node);
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    }

    async function handleConfirmDelete() {
      setConfirmDelete(false);
      try {
        await deleteSection({ manualId, sectionId: section.id }).unwrap();
        showSuccess("Section deleted.");
      } catch {
        showError("I couldn't delete that section. Want to try again?");
      }
    }

    return (
      <section
        ref={setRefs}
        style={style}
        className="border rounded-lg p-4 space-y-3 bg-card"
        data-testid="welcome-manual-section-card"
        data-section-id={section.id}
      >
        <div className="flex items-start gap-2">
          <button
            {...attributes}
            {...listeners}
            type="button"
            className="mt-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing min-h-[32px] min-w-[32px] flex items-center justify-center"
            aria-label={`Drag to reorder section ${section.title}`}
            data-testid="welcome-manual-section-drag-handle"
          >
            <GripVertical size={16} />
          </button>

          <div className="flex-1 min-w-0">
            <input
              {...editor.register("title", { required: "Title is required" })}
              className="w-full border rounded-md px-3 py-2 text-base font-medium min-h-[44px]"
              data-testid="welcome-manual-section-title"
              aria-label="Section title"
            />
            {editor.titleError ? (
              <p className="text-xs text-red-600 mt-1">{editor.titleError}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="mt-1 text-red-600 hover:bg-red-50 rounded p-1 min-h-[32px] min-w-[32px] flex items-center justify-center"
            aria-label="Delete section"
            data-testid="welcome-manual-section-delete-button"
          >
            <Trash2 size={16} />
          </button>
        </div>

        <FormField label="Instructions">
          <textarea
            {...editor.register("body")}
            rows={4}
            placeholder={BODY_PLACEHOLDER}
            className="w-full border rounded-md px-3 py-2 text-sm"
            data-testid="welcome-manual-section-body"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Supports markdown — **bold**, *italic*, lists, headings, links.
          </p>
        </FormField>
        {editor.bodyValue ? (
          <div data-testid="welcome-manual-section-body-preview">
            <p className="text-xs text-muted-foreground mb-1">Preview</p>
            <div className="border rounded-md px-3 py-2 bg-muted/30 min-h-[60px]">
              <Markdown content={editor.bodyValue} />
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={editor.handleCancel}
            disabled={!editor.isDirty || editor.isSaving}
            className="text-sm text-muted-foreground hover:text-foreground min-h-[44px] px-3 disabled:opacity-40"
            data-testid="welcome-manual-section-cancel"
          >
            Cancel
          </button>
          <LoadingButton
            type="button"
            onClick={editor.handleSubmit}
            isLoading={editor.isSaving}
            loadingText="Saving..."
            disabled={!editor.isDirty}
            data-testid="welcome-manual-section-save"
          >
            Save
          </LoadingButton>
        </div>

        <div className="border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Photos</p>
          <WelcomeManualSectionImageManager
            manualId={manualId}
            sectionId={section.id}
            images={section.images}
          />
        </div>

        <ConfirmDialog
          open={confirmDelete}
          title="Delete this section?"
          description="Photos uploaded to it will also be removed. This can't be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      </section>
    );
  },
);

export default WelcomeManualSectionCard;
