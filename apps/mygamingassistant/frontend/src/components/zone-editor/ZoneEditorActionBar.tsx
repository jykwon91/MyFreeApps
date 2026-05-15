/**
 * Floating action bar anchored bottom-right of the editor canvas.
 *
 * Replaces the right rail per the design review — eliminates the tablet
 * scroll problem and keeps actions always visible without competing with
 * the canvas for clicks.
 *
 * State machine (one button at a time):
 *   no zone selected         → null (nothing renders)
 *   zone selected, no polygon → "Draw"
 *   zone selected, has polygon → "Clear"
 *   currently drawing (mode='new') → "Cancel"
 */
import { Pencil, Trash2, X } from "lucide-react";

export type ActionBarMode = "draw" | "clear" | "cancel" | null;

export interface ZoneEditorActionBarProps {
  mode: ActionBarMode;
  selectedZoneName: string | null;
  onDraw: () => void;
  onClear: () => void;
  onCancel: () => void;
}

export default function ZoneEditorActionBar({
  mode,
  selectedZoneName,
  onDraw,
  onClear,
  onCancel,
}: ZoneEditorActionBarProps) {
  if (mode === null) return null;

  if (mode === "draw") {
    return (
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2 bg-card border rounded-lg shadow-lg p-1.5">
        <span className="text-xs text-muted-foreground px-2">
          {selectedZoneName ?? ""}
        </span>
        <button
          type="button"
          onClick={onDraw}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90 min-h-[36px]"
        >
          <Pencil className="w-4 h-4" aria-hidden />
          Draw polygon
        </button>
      </div>
    );
  }

  if (mode === "clear") {
    return (
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2 bg-card border rounded-lg shadow-lg p-1.5">
        <span className="text-xs text-muted-foreground px-2">
          {selectedZoneName ?? ""}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-card hover:bg-muted/40 text-sm text-destructive min-h-[36px]"
        >
          <Trash2 className="w-4 h-4" aria-hidden />
          Clear polygon
        </button>
      </div>
    );
  }

  // mode === "cancel"
  return (
    <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2 bg-card border rounded-lg shadow-lg p-1.5">
      <span className="text-xs text-muted-foreground px-2">
        Drawing — click first vertex or press Enter to close
      </span>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-card hover:bg-muted/40 text-sm min-h-[36px]"
      >
        <X className="w-4 h-4" aria-hidden />
        Cancel
      </button>
    </div>
  );
}
