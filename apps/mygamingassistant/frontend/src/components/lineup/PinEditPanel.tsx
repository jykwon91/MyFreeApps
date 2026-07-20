/**
 * PinEditPanel — operator-only surface for nudging an accepted lineup's pins.
 *
 * Mounts below the minimap in the map sidebar. When no lineup is selected it
 * shows a placeholder + a confirmed/total progress count. When a pin is
 * selected (via ?edit=<id>) it renders the draggable MinimapPinEditor and
 * Save / Save & Next actions.
 *
 * Reuses MinimapPinEditor (the review-queue dual-pin editor) and the
 * usePinEditor hook, so pin dragging, keyboard nudging, the dashed "guess"
 * ring, and the PATCH persistence all match the review flow.
 */
import { Check, X } from "lucide-react";
import MinimapPinEditor from "@/components/review/MinimapPinEditor";
import type { PinEditor } from "@/hooks/usePinEditor";

interface Props {
  editor: PinEditor;
  /** Minimap image URL for the editor inset (same source as the sidebar). */
  minimapUrl: string | null;
}

export default function PinEditPanel({ editor, minimapUrl }: Props) {
  const {
    selectedLineup,
    standAnchorX,
    standAnchorY,
    targetAnchorX,
    targetAnchorY,
    onStandChange,
    onTargetChange,
    onResetStand,
    onResetTarget,
    save,
    isSaving,
    setSelected,
    hasNext,
    confirmedCount,
    totalCount,
  } = editor;

  // Empty state — no pin selected yet. Doubles as the progress indicator so
  // the operator can see how much of the map is still on centroid fallback.
  if (!selectedLineup) {
    return (
      <div className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
        <p>Click a pin to nudge its position.</p>
        {totalCount > 0 && (
          <p className="mt-1 font-medium text-foreground">
            {confirmedCount} of {totalCount} placed
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Editing pin
          </p>
          <p className="text-sm font-medium truncate" title={selectedLineup.title}>
            {selectedLineup.title}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelected(null)}
          disabled={isSaving}
          className="p-1 rounded hover:bg-muted/40 transition-colors disabled:opacity-40 flex-shrink-0"
          aria-label="Close pin editor"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>

      <MinimapPinEditor
        lineup={selectedLineup}
        minimapUrl={minimapUrl}
        standAnchorX={standAnchorX}
        standAnchorY={standAnchorY}
        targetAnchorX={targetAnchorX}
        targetAnchorY={targetAnchorY}
        onStandChange={onStandChange}
        onTargetChange={onTargetChange}
        onResetStand={onResetStand}
        onResetTarget={onResetTarget}
        disabled={isSaving}
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => save(false)}
          disabled={isSaving}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md border border-input bg-background px-2 text-xs font-medium hover:enabled:bg-muted/40 disabled:opacity-50 transition-colors"
        >
          {isSaving ? (
            "Saving…"
          ) : (
            <>
              <Check className="w-3.5 h-3.5" aria-hidden />
              Save
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => save(true)}
          disabled={isSaving || !hasNext}
          title={hasNext ? "Save and jump to the next unplaced pin" : "No more unplaced pins"}
          className="flex-1 inline-flex items-center justify-center h-8 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:enabled:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isSaving ? "Saving…" : "Save & Next"}
        </button>
      </div>
    </div>
  );
}
