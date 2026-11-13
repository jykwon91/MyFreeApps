/**
 * GlanceBoard — main scrollable board for the redesigned MapPage.
 *
 * Renders all lineups for the current map grouped by target zone.
 * Exactly 2 tiles per row, no navigation depth — every lineup is always
 * visible in full-size. Zone section headers act as scroll anchors.
 *
 * Zone section order: A Site → B Site → Mid → others alphabetically.
 * Within each zone: Smoke → Flash → Molotov → HE → side (T/CT/Both).
 *
 * Usage:
 *   <GlanceBoard lineups={allLineups} isFetching={...} mapName={...} />
 */
import { useMemo } from "react";
import type { Lineup } from "@/types/game";
import { zoneAnchorId } from "./glanceBoardUtils";
import { groupByZone } from "@/lib/lineup/groupByZone";
import LineupBoardEmpty from "./LineupBoardEmpty";
import GlanceBoardTile from "./GlanceBoardTile";
import GlanceBoardSkeleton from "./GlanceBoardSkeleton";
import { DEFAULT_KNOBS } from "@/hooks/useDesignKnobs";
import type { DesignKnobs } from "@/hooks/useDesignKnobs";

interface GlanceBoardProps {
  lineups: Lineup[];
  isFetching: boolean;
  mapName: string;
  /** Applied utility type slugs from top-bar chips ([] = all). */
  filteredUtils: string[];
  /** Applied side value ("any" / "side_a" / "side_b"). */
  side: string;
  /** Direct-manipulation tile knobs (optional — falls back to DEFAULT_KNOBS). */
  knobs?: DesignKnobs;
  /** Operator-only per-pane edit affordances (Replace + Trim). Threaded
   *  through to each tile; auth gating lives at the page (MapPage) level so
   *  this component stays pure-presentation and its existing tests don't
   *  need a Redux Provider. */
  showOperatorOverlays?: boolean;
}

const GRID_COLS_CLASS: Record<1 | 2 | 3 | 4, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

// ---------------------------------------------------------------------------
// GlanceBoard
// ---------------------------------------------------------------------------
export default function GlanceBoard({
  lineups,
  isFetching,
  mapName,
  filteredUtils,
  side,
  knobs = DEFAULT_KNOBS,
  showOperatorOverlays = false,
}: GlanceBoardProps) {
  const colsClass = GRID_COLS_CLASS[knobs.tilesPerRow];
  const groups = useMemo(() => groupByZone(lineups), [lineups]);

  if (isFetching) {
    return <GlanceBoardSkeleton />;
  }

  if (lineups.length === 0) {
    return <LineupBoardEmpty mapName={mapName} side={side} filteredUtils={filteredUtils} />;
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.zoneSlug} id={zoneAnchorId(group.zoneSlug)}>
          {/* Zone section header — used as scroll anchor */}
          <h2 className="text-[13px] font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <span className="flex-1 border-t border-border" />
            <span>
              {group.zoneName}
              <span className="ml-1.5 font-normal text-muted-foreground">
                ({group.lineups.length})
              </span>
            </span>
            <span className="flex-1 border-t border-border" />
          </h2>

          {/* Tile grid — column count comes from the design knobs panel */}
          <div className={`grid ${colsClass} gap-4`}>
            {group.lineups.map((lineup) => (
              <GlanceBoardTile
                key={lineup.id}
                lineup={lineup}
                knobs={knobs}
                showOperatorOverlays={showOperatorOverlays}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
