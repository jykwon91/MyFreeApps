/**
 * GlanceBoardTile — glance-board summary tile: instantly answers "where do
 * I stand" and "where does it land", no hover/click required.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────┐
 *   │ [UTIL]  <title>                 <side>·<from>  │  header
 *   ├──────────────────────┬─────────────────────────┤
 *   │   STAND screenshot   │   LANDING screenshot     │  body (always-visible)
 *   ├──────────────────────┴─────────────────────────┤
 *   │  ⏱ <setup_seconds>s     <technique>       [⤢]  │  footer + expand
 *   └────────────────────────────────────────────────┘
 *   (expanded below: the full 4-pane GlanceBoardStoryboard)
 *
 * Body is exactly two stills (LineupStillPreview) — the tile drops from the
 * old 4-pane ~346px tall storyboard to ~180-200px. The full storyboard
 * (STAND/AIM/THROW/LANDING with clip/knob support) is NOT gone — it mounts
 * below the summary when the operator explicitly expands the tile, and
 * unmounts again on collapse (mirrors LineupListRow's row-expand pattern),
 * so a glance board with 60-80 lineups still mounts zero <video> decoders
 * by default.
 *
 * notes are NOT displayed inline; they live in a title= tooltip.
 */
import { useState } from "react";
import { Clock, Maximize2, Minimize2 } from "lucide-react";
import type { Lineup } from "@/types/game";
import { lineupUtilDisplay } from "@/constants/agentDisplay";
import { sideDisplay } from "@/constants/sideDisplay";
import LineupStillPreview from "./LineupStillPreview";
import GlanceBoardStoryboard from "./GlanceBoardStoryboard";
import { DEFAULT_KNOBS } from "@/hooks/useDesignKnobs";
import type { DesignKnobs } from "@/hooks/useDesignKnobs";

interface GlanceBoardTileProps {
  lineup: Lineup;
  knobs?: DesignKnobs;
  /** Operator-only per-pane edit affordances (Replace + Trim). Auth gating
   *  lives at MapPage level so this component stays a pure presentation tile
   *  (no Redux deps, no Provider required in unit tests). Default false keeps
   *  guest viewers + existing test fixtures unchanged. Only takes effect
   *  inside the expanded storyboard — the collapsed summary has no
   *  per-pane edit affordances. */
  showOperatorOverlays?: boolean;
}

function SideChip({ side }: { side: string | null }) {
  const cfg = sideDisplay(side);
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
export default function GlanceBoardTile({
  lineup,
  knobs = DEFAULT_KNOBS,
  showOperatorOverlays = false,
}: GlanceBoardTileProps) {
  const ud = lineupUtilDisplay(lineup.utility_type);
  const [expanded, setExpanded] = useState(false);

  return (
    <article
      className="rounded-lg border bg-card overflow-hidden flex flex-col"
      aria-label={`${ud.label}: ${lineup.title} — ${lineup.side ?? "any"} side — target ${lineup.target_zone?.name ?? "unknown"}`}
      title={lineup.notes ?? undefined}
    >
      {/* Mouse-only supplementary affordance wraps ONLY the always-visible
          header + summary — never the expanded storyboard below. Wrapping
          the whole article would let a click on an operator overlay button
          (Replace/Trim/Shift, rendered inside GlanceBoardStoryboard) bubble
          up and collapse the tile mid-interaction. The expand/collapse
          button in the footer is the sole keyboard-reachable,
          aria-expanded-owning control; this div adds cursor-pointer +
          onClick as a mouse-only convenience, no role/tabIndex, so there's
          no nested-interactive-element violation. */}
      <div className="cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        {/* ── Header — unchanged from the pre-preview-stills tile ───────── */}
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

        {/* ── Body: always-visible 2-still summary ───────────────────────
            Knob boundary: LineupStillPreview NEVER receives `knobs` and
            hard-codes still-only rendering — it cannot mount a <video> no
            matter what standMode/aimMode/landingMode are set to. Knobs
            apply ONLY inside the expanded GlanceBoardStoryboard below.
            Threading a clip URL in here would silently remount a live
            <video> on every glance-board tile and reintroduce the
            pre-perf-fix regression (a 60-80 lineup map mounting dozens of
            concurrent decoders). */}
        <LineupStillPreview lineup={lineup} />
      </div>

      {/* ── Expanded storyboard — mount-on-click / unmount-on-collapse,
          same lifecycle as LineupListRow's row-expand. Only here do knobs
          (and operator overlays) apply. */}
      {expanded && (
        <GlanceBoardStoryboard
          lineup={lineup}
          knobs={knobs}
          showOperatorOverlays={showOperatorOverlays}
        />
      )}

      {/* ── Footer — setup time + throw technique + expand toggle ───────── */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-muted/30 border-t min-h-[28px]">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {lineup.setup_seconds != null && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3 flex-shrink-0" aria-hidden />
              {lineup.setup_seconds}s
            </span>
          )}
          {lineup.technique != null && (
            <span
              className="min-w-0 truncate text-[11px] text-muted-foreground"
              title={lineup.technique}
              aria-label={`Throw technique: ${lineup.technique}`}
            >
              {lineup.technique}
            </span>
          )}
        </div>
        {/* Sole real interactive/keyboard element — owns aria-expanded,
            tabIndex, and Enter/Space activation (native <button> semantics).
            Stops propagation so it doesn't double-toggle via the article's
            onClick handler. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${lineup.title} storyboard`}
          className="shrink-0 p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          {expanded ? (
            <Minimize2 className="w-3.5 h-3.5" aria-hidden />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" aria-hidden />
          )}
        </button>
      </div>
    </article>
  );
}
