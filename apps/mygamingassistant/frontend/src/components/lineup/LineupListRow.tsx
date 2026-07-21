/**
 * LineupListRow — compact one-line row for the list-view rendering of the
 * glance board. Click anywhere on the row to expand the full 4-pane
 * GlanceBoardStoryboard (STAND / AIM / THROW / LANDING) inline below the
 * row directly — a single click, no intermediate summary-tile step.
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
 * Layout (compact, min-h-[44px] to fit the two mini thumbnails):
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ [icon] [stand→landing thumbs] Target ← Stand  · Side · Util  [▾]│
 *   └─────────────────────────────────────────────────────────────────┘
 *   (expanded below: GlanceBoardStoryboard — the full 4-pane storyboard)
 *
 * Expansion state lives in this component (useState) — the board does
 * NOT track which rows are expanded; multiple rows can be expanded
 * simultaneously and the operator chooses freely.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Crosshair } from "lucide-react";
import type { Lineup } from "@/types/game";
import type { Game } from "@/types/game";
import { lineupUtilDisplay } from "@/constants/agentDisplay";
import { sideDisplay } from "@/constants/sideDisplay";
import GlanceBoardStoryboard from "./GlanceBoardStoryboard";
import { MiniPosterThumb } from "./LineupStillPreview";
import type { DesignKnobs } from "@/hooks/useDesignKnobs";
import { DEFAULT_KNOBS } from "@/hooks/useDesignKnobs";

interface LineupListRowProps {
  lineup: Lineup;
  game?: Game | null;
  knobs?: DesignKnobs;
  showOperatorOverlays?: boolean;
  /** Fired with this lineup's id on pointer-enter and null on pointer-leave,
   *  so the parent can highlight the matching minimap pin(s). */
  onHover?: (lineupId: string | null) => void;
  /** True when this lineup is the one open in the pin editor (?edit=<id>).
   *  Highlights the row, badges it "EDITING", and scrolls it into view so the
   *  operator can see which list row the editor panel is bound to. */
  isEditing?: boolean;
  /** True when a minimap pin click focused this lineup (?lineup=<id>). The row
   *  auto-expands its storyboard and scrolls into view — the "navigate to the
   *  lineup and expanded" pin-click behaviour. */
  isFocused?: boolean;
  /** Superuser only — when provided, the expanded row shows an "Adjust pin"
   *  button that opens the pin editor for this lineup. Undefined for public
   *  viewers (no button). */
  onEditPin?: (lineupId: string) => void;
}

export default function LineupListRow({
  lineup,
  game,
  knobs = DEFAULT_KNOBS,
  showOperatorOverlays = false,
  onHover,
  isEditing = false,
  isFocused = false,
  onEditPin,
}: LineupListRowProps) {
  const [expanded, setExpanded] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  // When this row becomes the edited lineup, scroll it into the middle of the
  // viewport so the operator's eye lands on it right after the editor panel
  // opens on the left. Only fires on the isEditing→true transition.
  useEffect(() => {
    if (isEditing) {
      rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isEditing]);

  // When a pin click focuses this lineup (?lineup=<id>), open it and bring it
  // into view — the "navigate to the lineup and expanded" pin-click behaviour.
  useEffect(() => {
    if (isFocused) {
      setExpanded(true);
      rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isFocused]);

  const target = lineup.target_zone?.name ?? "Unknown";
  const stand = lineup.stand_zone?.name ?? null;
  const util = lineupUtilDisplay(lineup.utility_type);
  const technique = lineup.technique?.trim() || null;
  const sideCfg = sideDisplay(lineup.side, game ?? undefined);

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
    <div
      ref={rowRef}
      className={[
        "border-b last:border-b-0 scroll-mt-16",
        // Strong, unmistakable highlight when this row is the one bound to the
        // open pin editor — left accent bar + tinted background.
        isEditing && "border-l-4 border-l-primary bg-primary/10",
      ].filter(Boolean).join(" ")}
      onMouseEnter={() => onHover?.(lineup.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={`${target}${stand ? ` from ${stand}` : ""} — ${util.chipLabel} — ${sideCfg.label} side.${isEditing ? " Currently open in the pin editor." : ""} Click to ${expanded ? "collapse" : "expand"} storyboard.`}
        className={[
          "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors min-h-[44px]",
          isEditing ? "hover:bg-primary/15" : "hover:bg-muted/30",
        ].join(" ")}
      >
        {/* "EDITING" pill — only on the row bound to the open pin editor, so
            the editor panel ("Editing pin — <title>") and this list row are
            unmistakably the same lineup. */}
        {isEditing && (
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase bg-primary text-primary-foreground">
            Editing
          </span>
        )}
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

        {/* STAND → LANDING mini thumbnails — the same "instant glance"
            information the glance-board tile shows, compressed for the list
            row. Always aria-hidden (see MiniPosterThumb) — this button's own
            aria-label already carries the zone names. */}
        <span aria-hidden className="shrink-0 flex items-center gap-1">
          <MiniPosterThumb url={lineup.stand_screenshot_url} />
          <span className="text-muted-foreground text-[10px]">→</span>
          <MiniPosterThumb url={lineup.landing_screenshot_url} />
        </span>

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

        {/* Side chip — unified gold/blue tokens (constants/sideDisplay.ts) */}
        <span
          className={[
            "shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide uppercase",
            sideCfg.bg,
            sideCfg.text,
          ].join(" ")}
        >
          {sideCfg.label}
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

      {/* Inline expanded storyboard — a single row click opens the full
          4-pane storyboard (STAND / AIM / THROW / LANDING) directly, no
          intermediate summary-tile step. Only mounts (and therefore only
          attaches video decoders) when the row is expanded; collapse
          unmounts it so the decoders are released. This is the whole point
          of the list view — decoding is still deferred to clicked rows. */}
      {expanded && (
        <div className="px-3 pb-3 pt-1">
          <div className="rounded-lg border bg-card overflow-hidden">
            <GlanceBoardStoryboard
              lineup={lineup}
              knobs={knobs}
              showOperatorOverlays={showOperatorOverlays}
            />
          </div>
          {/* Deliberate pin-edit entry — replaces editor-on-every-pin-click.
              Rendered only when onEditPin is supplied (superusers); opens
              PinEditPanel via ?edit=<id>. */}
          {onEditPin && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => onEditPin(lineup.id)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors min-h-[44px]"
              >
                <Crosshair className="w-3.5 h-3.5" aria-hidden />
                Adjust pin
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
