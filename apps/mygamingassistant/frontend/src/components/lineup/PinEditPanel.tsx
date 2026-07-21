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

      {/* Save actions — placed directly under the header so they're visible the
          instant the panel opens, no scrolling past the (tall) in-game frame +
          map. The operator drags the pin below, then scrolls back here to Save.
          Sticky-at-bottom was unreliable in the scrollable sidebar. */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => save(false)}
          disabled={isSaving}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground hover:enabled:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isSaving ? (
            "Saving…"
          ) : (
            <>
              <Check className="w-4 h-4" aria-hidden />
              Save
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => save(true)}
          disabled={isSaving || !hasNext}
          title={hasNext ? "Save and jump to the next unplaced pin" : "No more unplaced pins"}
          className="flex-1 inline-flex items-center justify-center h-9 rounded-md border border-input bg-background px-2 text-xs font-medium hover:enabled:bg-muted/40 disabled:opacity-50 transition-colors"
        >
          {isSaving ? "Saving…" : "Save & Next"}
        </button>
      </div>

      {/* In-game stand frame — the operator places the reference pin by
          reading the white player marker off the in-game minimap (top-left of
          this frame). Zoomed to that corner so the marker is legible in the
          narrow sidebar. Without this the operator was placing blind against
          the clean reference map. */}
      {selectedLineup.stand_screenshot_url && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            In-game minimap — white marker = player's stand
          </p>
          <div
            className="w-full overflow-hidden rounded-lg border bg-black"
            style={{ maxWidth: 280, aspectRatio: "1 / 1" }}
          >
            <img
              src={selectedLineup.stand_screenshot_url}
              alt="In-game stand frame (minimap in the top-left corner)"
              draggable={false}
              className="block select-none"
              style={{ width: "380%", maxWidth: "none" }}
            />
          </div>
        </div>
      )}

      {/* Landing frame — reference for the orange Target pin. This is a
          first-person shot of where the utility lands (NOT a minimap), so it's
          shown full-frame, unlike the corner-zoomed stand frame above. Without
          it the operator had no cue for where on the map the lineup lands. */}
      {selectedLineup.landing_screenshot_url && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Where it lands — set the orange Target pin at this spot on the map
          </p>
          <div
            className="w-full overflow-hidden rounded-lg border bg-black"
            style={{ maxWidth: 280 }}
          >
            <img
              src={selectedLineup.landing_screenshot_url}
              alt="Landing frame — where the utility ends up"
              draggable={false}
              className="block w-full select-none"
            />
          </div>
        </div>
      )}

      {/* How-to line — the editor has no explicit "set" button (dragging IS
          the set), and "Reset stand/target" reads like a commit when it's
          actually an undo. Spell out the flow so the operator isn't guessing. */}
      <p className="text-[11px] leading-snug text-muted-foreground">
        Drag the <span className="font-medium text-foreground">blue Stand pin</span> onto
        the white marker (from the in-game frame), and the{" "}
        <span className="font-medium text-foreground">orange Target pin</span> to where it
        lands, then <span className="font-medium text-foreground">Save</span>.
        <span className="block text-muted-foreground/70">
          “Reset” just snaps a pin back to the auto/default spot — you don’t need it to save.
        </span>
      </p>

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
    </div>
  );
}
