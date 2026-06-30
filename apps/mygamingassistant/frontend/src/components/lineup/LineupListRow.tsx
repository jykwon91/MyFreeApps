/**
 * LineupListRow — compact one-line row for the list-view rendering of the
 * glance board. Click anywhere on the row to expand the full 4-pane
 * GlanceBoardTile inline below the row.
 *
 * Why the list view exists: the default card-grid renders every lineup
 * card as a full 4-pane storyboard, which mounts up to 4 simultaneous
 * looping ``<video>`` decoders per card. On a map with 60-80 lineups,
 * even with viewport-gating that's 16-24 concurrent H.264 decodes any
 * given moment — enough to push the browser tab to ~10% CPU. The list
 * view defers decoding entirely: rows are pure text + an expand
 * affordance, and only the rows the operator clicks-to-expand mount the
 * storyboard tile (and therefore the videos).
 *
 * Layout (compact ~36-44px tall):
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ [icon] Target ← Stand  · Side · Util · Technique          [▾]   │
 *   └─────────────────────────────────────────────────────────────────┘
 *   (expanded below: GlanceBoardTile with all 4 panes + footer)
 *
 * Expansion state lives in this component (useState) — the board does
 * NOT track which rows are expanded; multiple rows can be expanded
 * simultaneously and the operator chooses freely.
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Lineup } from "@/types/game";
import type { Game } from "@/types/game";
import { lineupUtilDisplay } from "@/constants/agentDisplay";
import GlanceBoardTile from "./GlanceBoardTile";
import type { DesignKnobs } from "@/hooks/useDesignKnobs";
import { DEFAULT_KNOBS } from "@/hooks/useDesignKnobs";

interface LineupListRowProps {
  lineup: Lineup;
  game?: Game | null;
  knobs?: DesignKnobs;
  showOperatorOverlays?: boolean;
}

function sideLabel(side: Lineup["side"], game: Game | null | undefined): string {
  if (side === "side_a") return game?.side_a_label ?? "T";
  if (side === "side_b") return game?.side_b_label ?? "CT";
  return "Both";
}

export default function LineupListRow({
  lineup,
  game,
  knobs = DEFAULT_KNOBS,
  showOperatorOverlays = false,
}: LineupListRowProps) {
  const [expanded, setExpanded] = useState(false);

  const target = lineup.target_zone?.name ?? "Unknown";
  const stand = lineup.stand_zone?.name ?? null;
  const util = lineupUtilDisplay(lineup.utility_type);
  const technique = lineup.technique?.trim() || null;
  const side = sideLabel(lineup.side, game);

  // Title is treated as supplementary — many ingested lineups inherit the
  // chapter title which restates target/stand. Only render it if it adds
  // something beyond the zone names.
  const titleAddsContext = (() => {
    if (!lineup.title) return false;
    const lower = lineup.title.toLowerCase();
    if (target && lower.includes(target.toLowerCase())) return false;
    if (stand && lower.includes(stand.toLowerCase())) return false;
    return true;
  })();

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={`${target}${stand ? ` from ${stand}` : ""} — ${util.chipLabel} — ${side} side. Click to ${expanded ? "collapse" : "expand"} storyboard.`}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors min-h-[36px]"
      >
        {/* Utility color dot — reuses the badge tokens from utilDisplay so
            row color-coding matches the storyboard tile's header chip. */}
        <span
          aria-hidden
          className={[
            "shrink-0 w-2.5 h-2.5 rounded-full",
            util.badgeBg,
          ].join(" ")}
          title={util.chipLabel}
        />
        {/* Visually-hidden text for screen readers / typeahead */}
        <span className="sr-only">{util.chipLabel}: </span>

        {/* Target ← Stand */}
        <span className="text-sm font-medium text-foreground truncate">
          {target}
          {stand && (
            <span className="text-muted-foreground font-normal">
              {" "}
              <span aria-hidden>←</span> {stand}
            </span>
          )}
        </span>

        {/* Side chip */}
        <span
          className={[
            "shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide uppercase",
            lineup.side === "side_a"
              ? "bg-orange-500/15 text-orange-700 dark:text-orange-300"
              : lineup.side === "side_b"
                ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                : "bg-muted/60 text-muted-foreground",
          ].join(" ")}
        >
          {side}
        </span>

        {/* Util label (text — duplicates the icon for accessibility / when
            the operator doesn't know the icon glyph) */}
        <span className="shrink-0 text-xs text-muted-foreground">
          {util.chipLabel}
        </span>

        {/* Technique (when present) */}
        {technique && (
          <span className="shrink-0 text-xs text-muted-foreground/80 truncate max-w-[200px]">
            · {technique}
          </span>
        )}

        {/* Title (only when it adds context beyond zone names) */}
        {titleAddsContext && (
          <span className="shrink-0 text-xs text-muted-foreground/60 italic truncate max-w-[160px]">
            · {lineup.title}
          </span>
        )}

        {/* Spacer + expand chevron */}
        <span className="flex-1" />
        <ChevronDown
          aria-hidden
          className={[
            "w-4 h-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          ].filter(Boolean).join(" ")}
        />
      </button>

      {/* Inline expanded storyboard — only mounts (and therefore only
          attaches video decoders) when the row is expanded. Collapse
          unmounts the tile so the decoders are released. This is the
          whole point of the list view. */}
      {expanded && (
        <div className="px-3 pb-3 pt-1">
          <GlanceBoardTile
            lineup={lineup}
            knobs={knobs}
            showOperatorOverlays={showOperatorOverlays}
          />
        </div>
      )}
    </div>
  );
}
