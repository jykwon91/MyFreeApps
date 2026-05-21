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
import { utilDisplay } from "@/constants/utilityDisplay";
import { zoneAnchorId } from "./glanceBoardUtils";
import GlanceBoardTile from "./GlanceBoardTile";
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
}

const GRID_COLS_CLASS: Record<1 | 2 | 3, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
};

// ---------------------------------------------------------------------------
// Zone ordering
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

// ---------------------------------------------------------------------------
// Lineup ordering within a zone — keyed by utility slug via utilDisplay
// ---------------------------------------------------------------------------
const SIDE_ORDER: Record<string, number> = {
  side_a: 0,
  side_b: 1,
  any:    2,
};

function compareLineups(a: Lineup, b: Lineup): number {
  const utilA = utilDisplay(a.utility_type?.slug).sortOrder;
  const utilB = utilDisplay(b.utility_type?.slug).sortOrder;
  if (utilA !== utilB) return utilA - utilB;
  const sideA = SIDE_ORDER[a.side ?? "any"] ?? 99;
  const sideB = SIDE_ORDER[b.side ?? "any"] ?? 99;
  return sideA - sideB;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Skeleton loader (2 tiles per row)
// ---------------------------------------------------------------------------
function GlanceBoardSkeleton() {
  return (
    <div className="space-y-8">
      {[1, 2].map((s) => (
        <div key={s} className="space-y-3">
          <div className="h-5 w-48 bg-muted/40 rounded animate-pulse" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2].map((t) => (
              <div key={t} className="rounded-lg bg-muted/40 animate-pulse" style={{ aspectRatio: "2 / 1" }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state helpers
// ---------------------------------------------------------------------------
function buildEmptyMessage(mapName: string, side: string, filteredUtils: string[]): string {
  const sideLabel = side === "side_a" ? "T" : side === "side_b" ? "CT" : null;
  const utilLabel = filteredUtils.length > 0 ? filteredUtils.join(", ") : null;
  if (!sideLabel && !utilLabel) return `No lineups on ${mapName} yet.`;
  const parts: string[] = [];
  if (utilLabel) parts.push(utilLabel);
  if (sideLabel) parts.push(sideLabel);
  return `No ${parts.join(" ")} lineups on this map.`;
}

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
}: GlanceBoardProps) {
  const colsClass = GRID_COLS_CLASS[knobs.tilesPerRow];
  const groups = useMemo(() => groupByZone(lineups), [lineups]);

  if (isFetching) {
    return <GlanceBoardSkeleton />;
  }

  if (lineups.length === 0) {
    const isFiltered = filteredUtils.length > 0 || side !== "any";
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-sm text-muted-foreground text-center">
          {buildEmptyMessage(mapName, side, filteredUtils)}
        </p>
        {isFiltered && (
          // Placeholder anchor — parent passes an onClearFilters via the
          // empty-state link rendered directly in MapPage, not here.
          // GlanceBoard itself is filter-agnostic; it just renders.
          <span className="text-xs text-muted-foreground/60">
            Try clearing filters in the top bar.
          </span>
        )}
      </div>
    );
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
              <span className="ml-1.5 font-normal text-muted-foreground/60">
                ({group.lineups.length})
              </span>
            </span>
            <span className="flex-1 border-t border-border" />
          </h2>

          {/* Tile grid — column count comes from the design knobs panel */}
          <div className={`grid ${colsClass} gap-4`}>
            {group.lineups.map((lineup) => (
              <GlanceBoardTile key={lineup.id} lineup={lineup} knobs={knobs} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
