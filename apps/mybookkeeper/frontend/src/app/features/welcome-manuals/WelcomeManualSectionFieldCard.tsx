import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import type { WelcomeManualSectionFieldResponse } from "@/shared/types/welcome-manual/welcome-manual-section-field-response";

export interface WelcomeManualSectionFieldCardProps {
  field: WelcomeManualSectionFieldResponse;
  onDelete: () => void;
  onLabelSave: (label: string) => void;
  onValueSave: (value: string) => void;
}

export default function WelcomeManualSectionFieldCard({
  field,
  onDelete,
  onLabelSave,
  onValueSave,
}: WelcomeManualSectionFieldCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function handleLabelBlur(e: React.FocusEvent<HTMLInputElement>) {
    const trimmed = e.target.value.trim();
    if (trimmed === field.label) return;
    onLabelSave(trimmed);
  }

  function handleValueBlur(e: React.FocusEvent<HTMLInputElement>) {
    const trimmed = e.target.value.trim();
    if (trimmed === (field.value ?? "")) return;
    onValueSave(trimmed);
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 border rounded-lg p-2 bg-card"
      data-testid="welcome-manual-field-card"
      data-field-id={field.id}
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label={`Drag to reorder field ${field.label}`}
        data-testid="welcome-manual-field-drag-handle"
      >
        <GripVertical size={16} />
      </button>

      {/* Uncontrolled: ``key`` re-mounts the input when the server value changes
          (after a successful save or a revert) so the displayed value
          re-baselines without a setState-in-effect. Edits live in the DOM and
          are read on blur. */}
      <input
        key={`label-${field.label}`}
        defaultValue={field.label}
        onBlur={handleLabelBlur}
        placeholder="Field name"
        className="flex-1 min-w-0 border rounded-md px-2 py-2 text-sm min-h-[44px] bg-transparent focus:outline-none focus:bg-muted/40"
        aria-label="Field name"
        data-testid="welcome-manual-field-label"
      />
      <input
        key={`value-${field.value ?? ""}`}
        defaultValue={field.value ?? ""}
        onBlur={handleValueBlur}
        placeholder="Value"
        className="flex-1 min-w-0 border rounded-md px-2 py-2 text-sm min-h-[44px] bg-transparent focus:outline-none focus:bg-muted/40"
        aria-label="Field value"
        data-testid="welcome-manual-field-value"
      />

      <button
        type="button"
        onClick={onDelete}
        className="text-red-600 hover:bg-red-50 rounded p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Remove field"
        data-testid="welcome-manual-field-delete-button"
      >
        <X size={16} />
      </button>
    </li>
  );
}
