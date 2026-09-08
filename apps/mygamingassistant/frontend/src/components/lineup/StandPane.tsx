/**
 * StandPane — top-left pane. Shows the player's stand position.
 *
 * Split out of LineupPanes.tsx so each file holds a single component.
 *
 * Renders the looping 1s micro-clip via ``ClipView`` when ``standClipUrl`` is
 * set, otherwise falls back to the original ``ScreenshotHalf`` still. The
 * micro-clip is anchored on the same classifier-chosen frame as the still, so
 * the swap is a visual upgrade — the framing matches frame-for-frame.
 *
 * Silent-fallback shape mirrors the THROW pane: a missing clip URL must
 * never read as a broken/error state, just as the still rendering.
 */
import { ClipView } from "./ClipView";
import { ScreenshotHalf } from "./ScreenshotHalf";

export interface StandPaneProps {
  // The stand still — the always-valid graceful degradation.
  standScreenshotUrl: string | null;
  // Presigned MinIO key for the stand 1s loop. Null/undefined falls back to
  // the still.
  standClipUrl?: string | null;
  // Title carried into the ClipView aria-label when the clip is rendered.
  title: string;
}

export function StandPane({ standScreenshotUrl, standClipUrl, title }: StandPaneProps) {
  if (standClipUrl) {
    return (
      <ClipView
        clipUrl={standClipUrl}
        posterUrl={standScreenshotUrl}
        title={title}
        label="STAND"
      />
    );
  }
  return (
    <ScreenshotHalf
      url={standScreenshotUrl}
      alt={`${title} — stand position`}
      label="STAND"
    />
  );
}
