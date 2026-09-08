/**
 * LandingPane — bottom-right pane. Shows where the utility lands.
 *
 * Split out of LineupPanes.tsx so each file holds a single component.
 *
 * When ``landingClipUrl`` is set we render a looping muted clip via the
 * shared ``ClipView`` primitive (same lazy-load + in-view autoplay + load-
 * failure tolerance as the THROW pane — the two surfaces are byte-equivalent
 * except for the corner label and the source URL). When the clip key is
 * null — older lineups, ingest's landing pass skipped (the confidence gate
 * didn't clear), or the chapter was too short for a clean cut — we
 * gracefully degrade to the original "Lands in: <zone>" text. This is the
 * same silent-fallback shape the THROW pane uses (stills when clip is null)
 * — never a misleading "video unavailable" placeholder.
 */
import { ClipView } from "./ClipView";
import { CornerLabel } from "./CornerLabel";

export interface LandingPaneProps {
  targetZoneName: string | null;
  // Presigned MinIO key for the landing clip. Null/undefined falls back to
  // text rendering. Optional for backwards-compat with existing call sites
  // that haven't been updated yet (they get the text behaviour, never a
  // runtime error).
  landingClipUrl?: string | null;
  // Poster shown before the clip loads / on a load failure. The aim still
  // is the closest existing artifact to the landing view (the player's
  // line-of-sight when throwing) — better than a blank black pane when the
  // clip is slow or unreachable. Optional; defaults to no poster.
  posterUrl?: string | null;
  // Title used by ClipView's aria-label. Defaults to a derived label so
  // existing call sites don't have to pass it; pass an explicit title (e.g.
  // the lineup title) when one is meaningful.
  title?: string;
}

export function LandingPane({
  targetZoneName,
  landingClipUrl,
  posterUrl = null,
  title,
}: LandingPaneProps) {
  if (landingClipUrl) {
    return (
      <ClipView
        clipUrl={landingClipUrl}
        posterUrl={posterUrl}
        title={title ?? `Lands in ${targetZoneName ?? "unknown"}`}
        label="LANDING"
      />
    );
  }
  return (
    <div className="flex-1 min-w-0 relative bg-muted/20 aspect-video overflow-hidden">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Lands in
        </span>
        <span className="text-sm font-semibold leading-tight max-w-full truncate">
          {targetZoneName ?? "—"}
        </span>
      </div>
      <CornerLabel>LANDING</CornerLabel>
    </div>
  );
}
