/**
 * MapBoardBody — the main content region of MapPage: picks between the
 * filtered-empty state, the list-view board, and the grid glance board.
 *
 * Extracted from MapPage so the page component stays under the file-size
 * budget; the three-way choice is self-contained and only needs the visible
 * lineup set, the current filter/view params, and a clear-filters callback.
 */
import GlanceBoard from "@/components/lineup/GlanceBoard";
import LineupListBoard from "@/components/lineup/LineupListBoard";
import type { Lineup, Game } from "@/types/game";
import type { DesignKnobs } from "@/hooks/useDesignKnobs";

interface Props {
  lineups: Lineup[];
  isFetching: boolean;
  mapName: string;
  filteredUtils: string[];
  side: string;
  sideA: string;
  sideB: string;
  activeZoneName: string | null;
  /** True when any filter (util/side/zone/agent) is narrowing the set — drives
   *  the "no matches, clear filters" empty state vs the truly-empty map. */
  hasActiveFilter: boolean;
  viewMode: "list" | "grid";
  game?: Game | null;
  knobs?: DesignKnobs;
  showOperatorOverlays: boolean;
  /** Hovered list row → highlight its pin(s) on the minimap. */
  onLineupHover: (lineupId: string | null) => void;
  /** Lineup open in the pin editor (?edit=) → highlight + scroll its row. */
  editingLineupId: string | null;
  onClearFilters: () => void;
}

export default function MapBoardBody({
  lineups,
  isFetching,
  mapName,
  filteredUtils,
  side,
  sideA,
  sideB,
  activeZoneName,
  hasActiveFilter,
  viewMode,
  game,
  knobs,
  showOperatorOverlays,
  onLineupHover,
  editingLineupId,
  onClearFilters,
}: Props) {
  if (lineups.length === 0 && !isFetching && hasActiveFilter) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-sm text-muted-foreground text-center">
          No{filteredUtils.length > 0 ? ` ${filteredUtils.join("/")}` : ""} lineups
          {side !== "any" ? ` for ${side === "side_a" ? sideA : sideB}` : ""}
          {activeZoneName ? ` in ${activeZoneName}` : ""}.
        </p>
        <button
          type="button"
          onClick={onClearFilters}
          className="text-sm text-primary hover:underline"
        >
          Clear filters
        </button>
      </div>
    );
  }

  if (viewMode === "list") {
    return (
      <LineupListBoard
        lineups={lineups}
        isFetching={isFetching}
        mapName={mapName}
        filteredUtils={filteredUtils}
        side={side}
        game={game}
        knobs={knobs}
        showOperatorOverlays={showOperatorOverlays}
        onLineupHover={onLineupHover}
        editingLineupId={editingLineupId}
      />
    );
  }

  return (
    <GlanceBoard
      lineups={lineups}
      isFetching={isFetching}
      mapName={mapName}
      filteredUtils={filteredUtils}
      side={side}
      knobs={knobs}
      showOperatorOverlays={showOperatorOverlays}
    />
  );
}
