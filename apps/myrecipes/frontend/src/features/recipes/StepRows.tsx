import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { Button } from "@platform/ui";
import type { EditableStepRow } from "@/features/recipes/editor-types";

interface Props {
  rows: EditableStepRow[];
  disabled?: boolean;
  onChange: (key: string, instruction: string) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onMove: (key: string, direction: -1 | 1) => void;
}

/**
 * Dynamic step rows: a numbered textarea per instruction with
 * add / remove / reorder controls. Order is implied by row position, matching
 * the backend's position-based step model.
 */
export default function StepRows({
  rows,
  disabled,
  onChange,
  onAdd,
  onRemove,
  onMove,
}: Props) {
  return (
    <div className="space-y-2">
      {rows.map((row, idx) => (
        <div key={row.key} className="flex items-start gap-2">
          <span className="mt-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
            {idx + 1}
          </span>
          <textarea
            aria-label={`Step ${idx + 1}`}
            placeholder="Describe this step"
            value={row.instruction}
            disabled={disabled}
            rows={2}
            onChange={(e) => onChange(row.key, e.target.value)}
            className="flex-1 rounded-md border bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          />
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Move step up"
              disabled={disabled || idx === 0}
              onClick={() => onMove(row.key, -1)}
              className="flex h-11 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Move step down"
              disabled={disabled || idx === rows.length - 1}
              onClick={() => onMove(row.key, 1)}
              className="flex h-11 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Remove step"
              disabled={disabled}
              onClick={() => onRemove(row.key)}
              className="flex h-11 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-30"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={onAdd} disabled={disabled}>
        <span className="inline-flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          Add step
        </span>
      </Button>
    </div>
  );
}
