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
import type { Lineup, Game } from "@/types/game";
import { zoneAnchorId } from "./glanceBoardUtils";
import LineupListRow from "./LineupListRow";
import { DEFAULT_KNOBS } from "@/hooks/useDesignKnobs";
import type { DesignKnobs } from "@/hooks/useDesignKnobs";
import { utilDisplay } from "@/constants/utilityDisplay";

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
}

// ---------------------------------------------------------------------------
// Grouping & ordering — match GlanceBoard's contract so switching views
// keeps zone-section order + within-zone lineup order identical.
// ---------------------------------------------------------------------------
const ZONE_ORDER_PREFIXES = [
  "a site", "a-site", "a_site",
  "b site", "b-site", "b_site",
  "mid",
];

function zoneOrder(zoneName: string): number {
  const lower = zoneName.toLowerCase();
  const idx = ZONE_ORDER_PREFIXES.findIndex((prefix) => lower.startsWith(prefix));
  return idx === -1 ? ZONE_ORDER_PREFIXES.length : idx;
}

function compareZones(a: string, b: string): number {
  const orderDiff = zoneOrder(a) - zoneOrder(b);
  if (orderDiff !== 0) return orderDiff;
  return a.localeCompare(b);
}

const SIDE_ORDER: Record<string, number> = {
  side_a: 0,
  side_b: 1,
  any: 2,
};

function compareLineups(a: Lineup, b: Lineup): number {
  const utilA = utilDisplay(a.utility_type?.slug).sortOrder;
  const utilB = utilDisplay(b.utility_type?.slug).sortOrder;
  if (utilA !== utilB) return utilA - utilB;
  const sideA = SIDE_ORDER[a.side ?? "any"] ?? 99;
  const sideB = SIDE_ORDER[b.side ?? "any"] ?? 99;
  return sideA - sideB;
}

interface ZoneGroup {
  zoneName: string;
  zoneSlug: string;
  lineups: Lineup[];
}

function groupByZone(lineups: Lineup[]): ZoneGroup[] {
  const map = new Map<string, ZoneGroup>();
  for (const l of lineups) {
    const name = l.target_zone?.name ?? "Unknown Zone";
    const slug = l.target_zone?.slug ?? "unknown";
    if (!map.has(name)) {
      map.set(name, { zoneName: name, zoneSlug: slug, lineups: [] });
    }
    map.get(name)!.lineups.push(l);
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.lineups.sort(compareLineups);
  }
  return groups.sort((a, b) => compareZones(a.zoneName, b.zoneName));
}

function buildEmptyMessage(mapName: string, side: string, filteredUtils: string[]): string {
  const sideLabel = side === "side_a" ? "T" : side === "side_b" ? "CT" : null;
  const utilLabel = filteredUtils.length > 0 ? filteredUtils.join(", ") : null;
  if (!sideLabel && !utilLabel) return `No lineups on ${mapName} yet.`;
  const parts: string[] = [];
  if (utilLabel) parts.push(utilLabel);
  if (sideLabel) parts.push(sideLabel);
  return `No ${parts.join(" ")} lineups on this map.`;
}

function LineupListSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2].map((s) => (
        <div key={s} className="space-y-2">
          <div className="h-5 w-48 bg-muted/40 rounded animate-pulse" />
          <div className="rounded-lg border divide-y">
            {[1, 2, 3, 4].map((r) => (
              <div key={r} className="h-9 bg-muted/30 animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
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
}: LineupListBoardProps) {
  const groups = useMemo(() => groupByZone(lineups), [lineups]);

  if (isFetching) {
    return <LineupListSkeleton />;
  }

  if (lineups.length === 0) {
    const isFiltered = filteredUtils.length > 0 || side !== "any";
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-sm text-muted-foreground text-center">
          {buildEmptyMessage(mapName, side, filteredUtils)}
        </p>
        {isFiltered && (
          <span className="text-xs text-muted-foreground/60">
            Try clearing filters in the top bar.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.zoneSlug} id={zoneAnchorId(group.zoneSlug)}>
          <h2 className="text-[13px] font-semibold text-muted-foreground mb-2 flex items-center gap-2">
            <span className="flex-1 border-t border-border" />
            <span>
              {group.zoneName}
              <span className="ml-1.5 font-normal text-muted-foreground/60">
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
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
