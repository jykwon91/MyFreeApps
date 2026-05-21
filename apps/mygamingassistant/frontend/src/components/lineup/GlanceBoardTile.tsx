/**
 * GlanceBoardTile — full-size tile for the glance board viewer.
 *
 * Designed for second-monitor use: a 2×2 storyboard with no click-to-expand.
 * The detail IS the default state.
 *
 * Layout (PR4 — four panes for four jobs):
 *   ┌────────────────────────────────────────────────┐
 *   │ [UTIL]  <title>                 <side>·<from>  │  header
 *   ├──────────────────────┬─────────────────────────┤
 *   │   STAND screenshot   │   AIM screenshot         │  top row
 *   │                      │       ● anchor dot      │
 *   ├──────────────────────┼─────────────────────────┤
 *   │   THROW (clip loop)  │   LANDING (text card)   │  bottom row
 *   │                      │   Lands in: <zone>      │
 *   ├──────────────────────┴─────────────────────────┤
 *   │  ⏱ <setup_seconds>s     <technique>            │  footer
 *   └────────────────────────────────────────────────┘
 *
 * Each pane does a distinct executional job: arrive (stand), look (aim),
 * throw (clip motion), land (target zone). All four render unconditionally
 * — gracefully degrades per-pane when its data is null. Same height as
 * today's single-clip tile (~346px at 500px wide); same per-pane size as
 * today's stand|aim fallback so the aim anchor dot keeps its accuracy.
 *
 * Today: STAND/AIM are stills; THROW is the PR2 looping clip; LANDING is a
 * placeholder text card. PR5 will replace LANDING with a real landing clip;
 * PR6 will replace stand/aim stills with 1s micro-clips. The 2×2 framework
 * is the same; panes just upgrade their content.
 *
 * Pane primitives (ScreenshotHalf, AimAnchorDot, ClipView, ThrowPlaceholder,
 * LandingPane) live in LineupPanes.tsx so LineupCard's expanded variant
 * renders the identical shape inside the detail-panel.
 *
 * notes are NOT displayed inline; they live in a title= tooltip.
 */
import { Clock } from "lucide-react";
import type { Lineup } from "@/types/game";
import { utilDisplay } from "@/constants/utilityDisplay";
import {
  AimPane,
  ClipView,
  LandingPane,
  StandPane,
  ThrowPlaceholder,
} from "./LineupPanes";
import { DEFAULT_KNOBS } from "@/hooks/useDesignKnobs";
import type { DesignKnobs } from "@/hooks/useDesignKnobs";

interface GlanceBoardTileProps {
  lineup: Lineup;
  knobs?: DesignKnobs;
}

// ---------------------------------------------------------------------------
// Side chip — CS2-style T=gold / CT=blue / Both=neutral
// ---------------------------------------------------------------------------
const SIDE_CHIP: Record<string, { bg: string; text: string; label: string }> = {
  side_a: { bg: "bg-yellow-500/20 border border-yellow-500/50", text: "text-yellow-600 dark:text-yellow-400", label: "T" },
  side_b: { bg: "bg-blue-500/20 border border-blue-500/50",     text: "text-blue-600 dark:text-blue-400",     label: "CT" },
  any:    { bg: "bg-muted border border-border",                text: "text-muted-foreground",                label: "⊕" },
};

function SideChip({ side }: { side: string | null }) {
  const cfg = side ? (SIDE_CHIP[side] ?? SIDE_CHIP.any) : SIDE_CHIP.any;
  return (
    <span
      className={`inline-flex items-center justify-center h-5 min-w-[22px] px-1 rounded text-[11px] font-bold ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// GlanceBoardTile
// ---------------------------------------------------------------------------
export default function GlanceBoardTile({ lineup, knobs = DEFAULT_KNOBS }: GlanceBoardTileProps) {
  const ud = utilDisplay(lineup.utility_type?.slug);

  // Knob-forced overrides: a "still" mode discards any clip URL even when
  // present, an "off" anchor-dot blanks the persisted coords. Done here
  // rather than inside the pane primitives so the panes stay knob-agnostic.
  const standClipForRender = knobs.standMode === "clip" ? lineup.stand_clip_url : null;
  const aimClipForRender   = knobs.aimMode   === "clip" ? lineup.aim_clip_url   : null;
  const aimDotX = knobs.showAimDot ? lineup.aim_anchor_x : null;
  const aimDotY = knobs.showAimDot ? lineup.aim_anchor_y : null;
  const landingClipForRender =
    knobs.landingMode === "clip" ? lineup.landing_clip_url : null;

  return (
    <article
      className="rounded-lg border bg-card overflow-hidden flex flex-col"
      aria-label={`${ud.label}: ${lineup.title} — ${lineup.side ?? "any"} side — target ${lineup.target_zone?.name ?? "unknown"}`}
      title={lineup.notes ?? undefined}
    >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b min-h-[36px]">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide flex-shrink-0 ${ud.badgeBg} ${ud.badgeText}`}
        >
          {ud.label.toUpperCase()}
        </span>
        <span className="flex-1 min-w-0 text-[13px] font-semibold leading-tight truncate">
          {lineup.title}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <SideChip side={lineup.side} />
          {lineup.stand_zone && (
            <span className="text-[11px] text-muted-foreground truncate max-w-[140px]">
              From: {lineup.stand_zone.name}
            </span>
          )}
        </div>
      </div>

      {/* ── Body: 2×2 storyboard grid ───────────────────────────────────
          Four panes, one per executional job. All render unconditionally;
          each gracefully degrades when its source data is null. Same
          per-pane dimensions as today's stand|aim fallback so the aim
          anchor dot retains current pixel accuracy. */}
      <div className="flex flex-col divide-y divide-border">
        {/* Top row: STAND | AIM */}
        <div className="flex divide-x divide-border">
          <StandPane
            standScreenshotUrl={lineup.stand_screenshot_url}
            standClipUrl={standClipForRender}
            title={lineup.title}
          />
          <AimPane
            aimScreenshotUrl={lineup.aim_screenshot_url}
            aimClipUrl={aimClipForRender}
            aimAnchorX={aimDotX}
            aimAnchorY={aimDotY}
            title={lineup.title}
          />
        </div>
        {/* Bottom row: THROW | LANDING */}
        <div className="flex divide-x divide-border">
          {lineup.clip_url ? (
            <ClipView
              clipUrl={lineup.clip_url}
              posterUrl={lineup.stand_screenshot_url}
              title={lineup.title}
            />
          ) : (
            <ThrowPlaceholder />
          )}
          <LandingPane
            targetZoneName={lineup.target_zone?.name ?? null}
            landingClipUrl={landingClipForRender}
            posterUrl={lineup.aim_screenshot_url}
            title={lineup.title}
          />
        </div>
      </div>

      {/* ── Footer — setup time + throw technique (PR3) ────────────────── */}
      {/* Technique is the "how" — subordinate to the clip (the "what"): same
          muted 11px weight as the clock, right-aligned. Null renders NOTHING
          (no placeholder) — mirrors PR2's clip silent-fallback so a missing
          technique never reads as a broken/error state on the glance board.
          The footer div always renders for structural consistency (the clock
          may be its only child, or it may be empty). */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-muted/30 border-t min-h-[28px]">
        {lineup.setup_seconds != null && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="w-3 h-3 flex-shrink-0" aria-hidden />
            {lineup.setup_seconds}s
          </span>
        )}
        {lineup.technique != null && (
          <span
            className="ml-auto min-w-0 truncate text-[11px] text-muted-foreground"
            title={lineup.technique}
            aria-label={`Throw technique: ${lineup.technique}`}
          >
            {lineup.technique}
          </span>
        )}
      </div>
    </article>
  );
}
