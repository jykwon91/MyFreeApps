/**
 * LineupListBoard — alternate-of-GlanceBoard render mode that shows lineups
 * as compact text rows (LineupListRow). Click a row to inline-expand its
 * full 4-pane storyboard tile.
 *
 * Same data + same grouping shape as GlanceBoard — just a different render
 * strategy. The view toggle in MapPage chooses between the two; URL state
 * is shared (?zone, ?side, ?util) so switching modes doesn't lose filters.
 *
 * Render cost vs GlanceBoard: a list-view row mounts zero ``<video>``
 * decoders by default. The full tile (with its 4 panes) only mounts when
 * the operator clicks a specific row to expand it. On a 60-80 lineup map
 * this drops idle browser CPU from ~10% to near zero.
 */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { Lineup, Game } from "@/types/game";
import { zoneAnchorId } from "./glanceBoardUtils";
import { groupByZone } from "@/lib/lineup/groupByZone";
import LineupBoardEmpty from "./LineupBoardEmpty";
import LineupListRow from "./LineupListRow";
import LineupListSkeleton from "./LineupListSkeleton";
import { DEFAULT_KNOBS } from "@/hooks/useDesignKnobs";
import type { DesignKnobs } from "@/hooks/useDesignKnobs";

interface LineupListBoardProps {
  lineups: Lineup[];
  isFetching: boolean;
  mapName: string;
  filteredUtils: string[];
  side: string;
  /** Optional reference to the current game — drives side labels on rows. */
  game?: Game | null;
  knobs?: DesignKnobs;
  showOperatorOverlays?: boolean;
  /** Fired with a lineup id when a row is hovered, null on leave — lets
   *  MapPage highlight the matching minimap pin(s). */
  onLineupHover?: (lineupId: string | null) => void;
  /** Lineup currently open in the pin editor (?edit=<id>). The matching row
   *  highlights + scrolls into view so the operator can see which lineup the
   *  editor panel is bound to. Null when no lineup is being edited. */
  editingLineupId?: string | null;
}

export default function LineupListBoard({
  lineups,
  isFetching,
  mapName,
  filteredUtils,
  side,
  game,
  knobs = DEFAULT_KNOBS,
  showOperatorOverlays = false,
  onLineupHover,
  editingLineupId = null,
}: LineupListBoardProps) {
  const groups = useMemo(() => groupByZone(lineups), [lineups]);
  const [searchParams, setSearchParams] = useSearchParams();

  // ?lineup=<id> — set by a minimap pin click (MapSpatialSidebar). The matching
  // row auto-expands + scrolls into view: "navigate to the lineup and expanded".
  const focusedLineupId = searchParams.get("lineup");

  // Superuser pin editing is now a deliberate action from the expanded row's
  // "Adjust pin" button, not a side effect of every pin click. Only wired when
  // operator overlays are on (i.e. the viewer is the superuser).
  function handleEditPin(lineupId: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("edit", lineupId);
        return next;
      },
      { replace: true },
    );
  }

  if (isFetching) {
    return <LineupListSkeleton />;
  }

  if (lineups.length === 0) {
    return <LineupBoardEmpty mapName={mapName} side={side} filteredUtils={filteredUtils} />;
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.zoneSlug} id={zoneAnchorId(group.zoneSlug)}>
          <h2 className="text-[13px] font-semibold text-muted-foreground mb-2 flex items-center gap-2">
            <span className="flex-1 border-t border-border" />
            <span>
              {group.zoneName}
              <span className="ml-1.5 font-normal text-muted-foreground">
                ({group.lineups.length})
              </span>
            </span>
            <span className="flex-1 border-t border-border" />
          </h2>

          <div className="rounded-lg border bg-card/30 overflow-hidden">
            {group.lineups.map((lineup) => (
              <LineupListRow
                key={lineup.id}
                lineup={lineup}
                game={game}
                knobs={knobs}
                showOperatorOverlays={showOperatorOverlays}
                onHover={onLineupHover}
                isEditing={lineup.id === editingLineupId}
                isFocused={lineup.id === focusedLineupId}
                onEditPin={showOperatorOverlays ? handleEditPin : undefined}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
