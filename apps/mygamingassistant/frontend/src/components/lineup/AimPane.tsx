/**
 * AimPane — top-right pane. Shows the player's crosshair-aim view.
 *
 * Split out of LineupPanes.tsx so each file holds a single component.
 * ``AIM_ZOOM_STYLE`` moves with it because nothing outside this component
 * reads it.
 *
 * Same upgrade-with-still-fallback shape as ``StandPane``. Where StandPane
 * renders the source frame as-is, AimPane applies a 2× zoom centered on the
 * frame middle — the operator sees a magnified crop on the crosshair area,
 * which replaces the old red anchor dot.
 *
 * Zoom origin is pinned to (50%, 50%) (operator-confirmed 2026-05-23: the
 * crosshair in tactical FPS is always at screen center, so the alignment
 * marker at the aim moment is also at screen center). The persisted
 * ``aim_anchor_x/y`` coords (still passed through ``aimAnchorX/Y`` props
 * for legacy / backward-compat reasons) are intentionally ignored — they
 * were grid-classifier-derived from a different aim frame than the AIM
 * clip is now anchored on (AIM_TS moved to release_ts − 0.8s), so
 * trusting them would re-introduce drift. The DB column itself is
 * vestigial and can be cleaned up in a follow-up PR.
 */
import { ClipView } from "./ClipView";
import { ScreenshotHalf } from "./ScreenshotHalf";

export interface AimPaneProps {
  aimScreenshotUrl: string | null;
  aimClipUrl?: string | null;
  // Persisted anchor coords. Vestigial since 2026-05-23 — ignored at render
  // time (zoom is always centered). Kept on the prop for now so callers
  // don't break; remove when the DB column is dropped.
  aimAnchorX: number | null;
  aimAnchorY: number | null;
  title: string;
}

const AIM_ZOOM_STYLE: React.CSSProperties = {
  transform: "scale(2)",
  transformOrigin: "50% 50%",
};

export function AimPane({
  aimScreenshotUrl,
  aimClipUrl,
  // aim_anchor_x/y are vestigial (see component header). Destructure them so
  // the prop interface stays unchanged for callers, then ignore.
  aimAnchorX: _aimAnchorX,
  aimAnchorY: _aimAnchorY,
  title,
}: AimPaneProps) {
  if (aimClipUrl) {
    return (
      <ClipView
        clipUrl={aimClipUrl}
        posterUrl={aimScreenshotUrl}
        title={title}
        label="AIM"
        videoStyle={AIM_ZOOM_STYLE}
      />
    );
  }
  return (
    <ScreenshotHalf
      url={aimScreenshotUrl}
      alt={`${title} — aim reference`}
      label="AIM"
      imgStyle={AIM_ZOOM_STYLE}
    />
  );
}
