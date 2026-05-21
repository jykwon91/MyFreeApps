/**
 * PaneReplaceOverlay — per-pane upload affordance (PR1).
 *
 * Two visual states layered over a single pane:
 *
 *   1. **Idle** — the Replace icon button sits in the bottom-right corner.
 *      Invisible by default; opacity fades to 100 on parent ``group/pane``
 *      hover OR on the button's own keyboard focus (so tab-key users can
 *      reach it without a mouse). Per the UX review: icon-only at this
 *      density (~250×140px panes), not a text label.
 *
 *   2. **Uploading / error** — a full-pane scrim overlays the pane content
 *      with a horizontal progress bar at the bottom edge (or a red inline
 *      error with a Retry link if the upload failed). RTK Query
 *      invalidation transitions back to idle when the confirm completes,
 *      so this component doesn't render a separate success state.
 *
 * Only renders when the operator is authenticated — the parent gates the
 * mount via ``useIsSuperuser`` so guest viewers never see the affordance.
 */
import { useId, useRef } from "react";
import { Upload, RotateCcw } from "lucide-react";
import { usePaneUpload } from "@/hooks/usePaneUpload";
import type { PanePosition } from "@/hooks/usePaneUpload";

interface PaneReplaceOverlayProps {
  lineupId: string;
  pane: PanePosition;
  /** Last file the operator picked — kept on the parent so Retry can resend
   *  without re-opening the OS file picker. */
  // Set inside the component via a ref so re-renders don't rebuild the input.
}

// File picker accept lists. Mirror the server's ALLOWED_*_MIMES — keeping
// them in lockstep is part of "MIME mismatch rejection" guard #1 (pre-filter
// at the OS picker, before any selection).
const ACCEPT_STAND_AIM = "image/png,image/jpeg,image/webp,video/mp4,video/webm";
const ACCEPT_CLIP_ONLY = "video/mp4,video/webm";

function acceptFor(pane: PanePosition): string {
  return pane === "stand" || pane === "aim" ? ACCEPT_STAND_AIM : ACCEPT_CLIP_ONLY;
}

export default function PaneReplaceOverlay({ lineupId, pane }: PaneReplaceOverlayProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastFileRef = useRef<File | null>(null);

  const { phase, upload, reset } = usePaneUpload();

  function pickFile() {
    inputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input value so picking the SAME file twice still fires
    // change. Without this, a retry that re-picks the same file silently
    // does nothing.
    e.target.value = "";
    if (!file) return;
    lastFileRef.current = file;
    void upload({ lineupId, pane, file });
  }

  function retry() {
    if (lastFileRef.current) {
      void upload({ lineupId, pane, file: lastFileRef.current });
    } else {
      // No prior file (e.g. operator cleared the picker) — reopen it.
      reset();
      pickFile();
    }
  }

  return (
    <>
      {/* Hidden file input — sr-only style instead of display:none because
          Safari blocks programmatic .click() on display:none inputs. */}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={acceptFor(pane)}
        onChange={onFileChange}
        className="sr-only"
        aria-hidden
      />

      {/* Idle: hover/focus-revealed Upload button. Hidden during upload so
          the operator can't accidentally start a second upload mid-flight. */}
      {phase.phase === "idle" && (
        <button
          type="button"
          onClick={pickFile}
          aria-label={`Replace ${pane} pane content`}
          title={`Replace ${pane}`}
          className={[
            "absolute bottom-1.5 right-1.5 z-10",
            "opacity-0 group-hover/pane:opacity-100 focus-visible:opacity-100",
            "transition-opacity duration-150",
            "p-1.5 rounded bg-black/60 text-white hover:bg-black/80",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-inset",
          ].join(" ")}
        >
          <Upload className="w-3.5 h-3.5" aria-hidden />
        </button>
      )}

      {/* Uploading: full-pane semi-transparent scrim + bottom progress bar. */}
      {phase.phase === "uploading" && (
        <div
          role="status"
          aria-label={`Uploading replacement for ${pane}: ${Math.round(phase.progress * 100)}%`}
          className="absolute inset-0 z-10 bg-black/50 flex flex-col justify-end"
        >
          <div className="h-0.5 bg-white/20 w-full">
            <div
              className="h-full bg-white transition-[width] duration-100 ease-linear"
              style={{ width: `${Math.round(phase.progress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Error: full-pane scrim + inline message + Retry. Stays in-pane (not
          a toast) per the UX review — the operator's eye is on the pane they
          just dropped on. */}
      {phase.phase === "error" && (
        <div
          role="alert"
          className="absolute inset-0 z-10 bg-black/70 flex flex-col items-center justify-center gap-1.5 px-2 text-center"
        >
          <span className="text-xs font-semibold text-red-400 leading-tight">
            {phase.message}
          </span>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1 text-[11px] text-white/80 hover:text-white underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded px-1"
          >
            <RotateCcw className="w-3 h-3" aria-hidden />
            Retry
          </button>
        </div>
      )}
    </>
  );
}
