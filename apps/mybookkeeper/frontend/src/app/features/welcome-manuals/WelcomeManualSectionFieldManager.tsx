import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { LoadingButton, ConfirmDialog } from "@platform/ui";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  MAX_FIELDS_PER_SECTION,
  NEW_FIELD_DEFAULT_LABEL,
} from "@/shared/lib/welcome-manual-constants";
import {
  useCreateSectionFieldMutation,
  useDeleteSectionFieldMutation,
  useUpdateSectionFieldMutation,
} from "@/shared/store/welcomeManualsApi";
import type { WelcomeManualSectionFieldResponse } from "@/shared/types/welcome-manual/welcome-manual-section-field-response";
import WelcomeManualSectionFieldCard from "./WelcomeManualSectionFieldCard";

export interface WelcomeManualSectionFieldManagerProps {
  manualId: string;
  sectionId: string;
  fields: readonly WelcomeManualSectionFieldResponse[];
}

export default function WelcomeManualSectionFieldManager({
  manualId,
  sectionId,
  fields,
}: WelcomeManualSectionFieldManagerProps) {
  const [createField, { isLoading: isAdding }] = useCreateSectionFieldMutation();
  const [deleteField] = useDeleteSectionFieldMutation();
  const [updateField] = useUpdateSectionFieldMutation();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortedFields = [...fields].sort((a, b) => a.display_order - b.display_order);
  const displayIds = orderedIds ?? sortedFields.map((f) => f.id);
  const fieldsById = new Map(sortedFields.map((f) => [f.id, f]));
  const atCap = sortedFields.length >= MAX_FIELDS_PER_SECTION;

  async function handleAdd() {
    if (atCap) return;
    try {
      await createField({
        manualId,
        sectionId,
        data: { label: NEW_FIELD_DEFAULT_LABEL, value: null },
      }).unwrap();
    } catch {
      showError("I couldn't add that field. Want to try again?");
    }
  }

  async function handleConfirmDelete() {
    const fieldId = confirmDeleteId;
    if (!fieldId) return;
    setConfirmDeleteId(null);
    try {
      await deleteField({ manualId, sectionId, fieldId }).unwrap();
      showSuccess("Field removed.");
    } catch {
      showError("I couldn't remove that field. Want to try again?");
    }
  }

  async function handleFieldSave(
    fieldId: string,
    changes: { label?: string; value?: string | null },
  ) {
    try {
      await updateField({ manualId, sectionId, fieldId, ...changes }).unwrap();
    } catch {
      showError("I couldn't save that field. Want to try again?");
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = displayIds.indexOf(String(active.id));
    const newIndex = displayIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(displayIds, oldIndex, newIndex);
    setOrderedIds(newOrder);

    // There's no bulk-order endpoint for section fields — fire one PATCH per
    // field whose display_order changed. Small-N per section keeps this cheap,
    // mirroring the image manager.
    try {
      await Promise.all(
        newOrder.map((fieldId, index) => {
          const current = fieldsById.get(fieldId);
          if (!current) return Promise.resolve();
          if (current.display_order === index) return Promise.resolve();
          return updateField({ manualId, sectionId, fieldId, display_order: index }).unwrap();
        }),
      );
    } catch {
      showError("I couldn't save the new order. Reverting.");
      setOrderedIds(null);
    }
  }

  return (
    <div className="space-y-3" data-testid="welcome-manual-field-manager">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {atCap
            ? `You've reached the ${MAX_FIELDS_PER_SECTION}-field limit for this section.`
            : "Label / value pairs, like Wi-Fi network → password."}
        </p>
        <LoadingButton
          variant="secondary"
          size="sm"
          isLoading={isAdding}
          loadingText="Adding…"
          onClick={handleAdd}
          disabled={atCap}
          type="button"
          data-testid="welcome-manual-field-add-button"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add field
        </LoadingButton>
      </div>

      {sortedFields.length === 0 ? (
        <p
          className="text-sm text-muted-foreground border rounded-lg p-6 text-center"
          data-testid="welcome-manual-field-empty-state"
        >
          No details yet. Add a few key facts guests will want at a glance.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={displayIds} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2 list-none" data-testid="welcome-manual-field-list">
              {displayIds.map((fieldId) => {
                const field = fieldsById.get(fieldId);
                if (!field) return null;
                return (
                  <WelcomeManualSectionFieldCard
                    key={fieldId}
                    field={field}
                    onDelete={() => setConfirmDeleteId(fieldId)}
                    onLabelSave={(label) => void handleFieldSave(fieldId, { label })}
                    onValueSave={(value) => void handleFieldSave(fieldId, { value: value || null })}
                  />
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Remove this field?"
        description="The field will be deleted from this section. This can't be undone."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
