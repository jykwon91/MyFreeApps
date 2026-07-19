/**
 * GlanceBoardStoryboard — the full 4-pane knob-driven storyboard body.
 *
 * Extracted from the pre-preview-stills GlanceBoardTile (which used to
 * render this unconditionally as its entire body). Now mounted ONLY when
 * an operator explicitly expands a GlanceBoardTile summary (or a
 * LineupListRow row) — the always-visible glance-board default is the
 * 2-still LineupStillPreview, which never mounts a <video> and never
 * touches `knobs`. See the knob-boundary comment in GlanceBoardTile.tsx.
 *
 * Layout (unchanged from the pre-extraction PR4 shape):
 *   ┌──────────────────────┬─────────────────────────┐
 *   │   STAND screenshot   │   AIM (2× zoom on       │  top row
 *   │                      │   persisted anchor)     │
 *   ├──────────────────────┼─────────────────────────┤
 *   │   THROW (clip loop)  │   LANDING (text card)   │  bottom row
 *   │                      │   Lands in: <zone>      │
 *   └──────────────────────┴─────────────────────────┘
 *
 * Each pane does a distinct executional job: arrive (stand), look (aim),
 * throw (clip motion), land (target zone). All four render unconditionally
 * — gracefully degrades per-pane when its data is null. The AIM pane
 * applies a 2× zoom transform centered on screen middle (see AimPane in
 * LineupPanes.tsx for the full rationale).
 *
 * Pane primitives (ScreenshotHalf, ClipView, ThrowPlaceholder, LandingPane,
 * StandPane, AimPane) live in LineupPanes.tsx so LineupCard's expanded
 * variant renders the identical shape inside the detail-panel.
 */
import type { ReactNode } from "react";
import type { Lineup } from "@/types/game";
import {
  AimPane,
  ClipView,
  LandingPane,
  StandPane,
  ThrowPlaceholder,
} from "./LineupPanes";
import { DEFAULT_KNOBS } from "@/hooks/useDesignKnobs";
import type { DesignKnobs } from "@/hooks/useDesignKnobs";
import MicroClipShiftOverlay from "./MicroClipShiftOverlay";
import PaneReplaceOverlay from "./PaneReplaceOverlay";
import PaneTrimOverlay from "./PaneTrimOverlay";
import type { PanePosition } from "@/hooks/usePaneUpload";

interface GlanceBoardStoryboardProps {
  lineup: Lineup;
  knobs?: DesignKnobs;
  /** Operator-only per-pane edit affordances (Replace + Trim). Auth gating
   *  lives at MapPage level so this component stays a pure presentation
   *  tile (no Redux deps, no Provider required in unit tests). */
  showOperatorOverlays?: boolean;
}

// ---------------------------------------------------------------------------
// PaneSlot — wraps each pane in a group/pane div so hover-scoped affordances
// (PaneReplaceOverlay) resolve to THIS pane only, not the whole tile. The
// pane primitives in LineupPanes.tsx own their own ``flex-1 min-w-0`` so the
// wrapper just adds positioning context — no flex sizing is moved here.
// ---------------------------------------------------------------------------
function PaneSlot({
  lineupId,
  pane,
  showOverlay,
  paneClipUrl,
  children,
}: {
  lineupId: string;
  pane: PanePosition;
  showOverlay: boolean;
  /** Effective per-pane clip URL — drives the Trim affordance on throw /
   *  landing panes. Null hides the scissors icon (nothing to trim). Stand /
   *  aim micro-clips are 1s by design and intentionally not trimmable, so
   *  this prop is undefined for those panes. */
  paneClipUrl?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="relative group/pane flex flex-1 min-w-0">
      {children}
      {showOverlay && <PaneReplaceOverlay lineupId={lineupId} pane={pane} />}
      {showOverlay && (pane === "throw" || pane === "landing") && (
        <PaneTrimOverlay
          lineupId={lineupId}
          pane={pane}
          clipUrl={paneClipUrl ?? null}
        />
      )}
      {showOverlay && (pane === "stand" || pane === "aim") && (
        <MicroClipShiftOverlay
          lineupId={lineupId}
          pane={pane}
          clipUrl={paneClipUrl ?? null}
        />
      )}
    </div>
  );
}

export default function GlanceBoardStoryboard({
  lineup,
  knobs = DEFAULT_KNOBS,
  showOperatorOverlays = false,
}: GlanceBoardStoryboardProps) {
  // Knob-forced overrides: a "still" mode discards any clip URL even when
  // present, an "off" anchor-dot blanks the persisted coords. Done here
  // rather than inside the pane primitives so the panes stay knob-agnostic.
  // This is the ONLY place knobs are consulted — the always-visible
  // LineupStillPreview summary never receives them (see GlanceBoardTile.tsx).
  const standClipForRender = knobs.standMode === "clip" ? lineup.stand_clip_url : null;
  const aimClipForRender   = knobs.aimMode   === "clip" ? lineup.aim_clip_url   : null;
  const aimDotX = knobs.showAimDot ? lineup.aim_anchor_x : null;
  const aimDotY = knobs.showAimDot ? lineup.aim_anchor_y : null;
  const landingClipForRender =
    knobs.landingMode === "clip" ? lineup.landing_clip_url : null;

  return (
    <div className="flex flex-col divide-y divide-border">
      {/* Top row: STAND | AIM */}
      <div className="flex divide-x divide-border">
        <PaneSlot
          lineupId={lineup.id}
          pane="stand"
          showOverlay={showOperatorOverlays}
          paneClipUrl={lineup.stand_clip_url}
        >
          <StandPane
            standScreenshotUrl={lineup.stand_screenshot_url}
            standClipUrl={standClipForRender}
            title={lineup.title}
          />
        </PaneSlot>
        <PaneSlot
          lineupId={lineup.id}
          pane="aim"
          showOverlay={showOperatorOverlays}
          paneClipUrl={lineup.aim_clip_url}
        >
          <AimPane
            aimScreenshotUrl={lineup.aim_screenshot_url}
            aimClipUrl={aimClipForRender}
            aimAnchorX={aimDotX}
            aimAnchorY={aimDotY}
            title={lineup.title}
          />
        </PaneSlot>
      </div>
      {/* Bottom row: THROW | LANDING */}
      <div className="flex divide-x divide-border">
        <PaneSlot
          lineupId={lineup.id}
          pane="throw"
          showOverlay={showOperatorOverlays}
          paneClipUrl={lineup.clip_url}
        >
          {lineup.clip_url ? (
            <ClipView
              clipUrl={lineup.clip_url}
              posterUrl={lineup.stand_screenshot_url}
              title={lineup.title}
            />
          ) : (
            <ThrowPlaceholder />
          )}
        </PaneSlot>
        <PaneSlot
          lineupId={lineup.id}
          pane="landing"
          showOverlay={showOperatorOverlays}
          paneClipUrl={landingClipForRender}
        >
          <LandingPane
            targetZoneName={lineup.target_zone?.name ?? null}
            landingClipUrl={landingClipForRender}
            posterUrl={lineup.aim_screenshot_url}
            title={lineup.title}
          />
        </PaneSlot>
      </div>
    </div>
  );
}
