/**
 * GlanceBoardMinimapSidebar — spatial index for the glance board.
 *
 * Renders the minimap image with zone SVG polygons (density coloring,
 * same as MapZoneOverlay). Behaviour depends on which click handler the
 * parent provides:
 *
 *  - **Default (no onZoneClick)** — polygon clicks smooth-scroll the
 *    main board area to that zone's section header. Read-only spatial
 *    navigation, the original glance-board behaviour.
 *
 *  - **With onZoneClick** — polygon clicks invoke the callback (parent
 *    typically uses it to set a zone filter URL param). Clicking the
 *    currently-active zone is the toggle: parent should clear the filter.
 *    The active zone gets distinct fill + stroke so the operator can see
 *    which zone is currently selected.
 *
 * Fallback: if the minimap image fails to load, renders a scrollable text
 * list of zone names that runs the same handler on click (filter when
 * onZoneClick is provided, scroll otherwise).
 */
import { useState } from "react";
import type { Lineup, MapZone, ZoneDensity } from "@/types/game";
import { zoneAnchorId } from "./glanceBoardUtils";
import MapLineupPins, { type PinMode } from "./MapLineupPins";

interface Props {
  minimapUrl: string | null;
  zones: MapZone[];
  density: ZoneDensity;
  viewBoxSize?: number;
  /** When provided, polygon + zone-list clicks invoke this instead of the
   *  default scroll-to-section behaviour. Used by MapPage to set a zone
   *  filter URL param. */
  onZoneClick?: (zoneSlug: string) => void;
  /** When set, the matching polygon is rendered with active fill/stroke
   *  so the operator can see the current filter. Pass null when no zone
   *  filter is active. */
  activeZoneSlug?: string | null;
  /** Lineups to overlay as pins on the minimap. Requires pinMode to be set
   *  and the minimap image to be present (pins only render in the image
   *  branch, never the text-list fallback). */
  lineups?: Lineup[];
  pinMode?: PinMode | null;
  selectedLineupId?: string | null;
  onPinSelect?: (lineupId: string) => void;
}

// Density fill/stroke — same tokens as MapZoneOverlay
const FILL_HAS_LINEUPS   = "rgba(34,197,94,0.18)";
const FILL_EMPTY         = "rgba(156,163,175,0.10)";
const STROKE_HAS_LINEUPS = "rgba(34,197,94,0.7)";
const STROKE_EMPTY       = "rgba(255,255,255,0.25)";
const STROKE_HOVER       = "rgba(251,191,36,0.9)";
const FILL_HOVER         = "rgba(251,191,36,0.18)";
// Active (currently-filtered) zone — primary accent so it stands out
// from hover (amber) and from has-lineups (green).
const FILL_ACTIVE        = "rgba(59,130,246,0.32)";
const STROKE_ACTIVE      = "rgba(59,130,246,0.95)";

function pointsToSvg(
  polygon_points: Array<{ x: number; y: number }>,
  viewBoxSize: number,
): string {
  return polygon_points
    .map((p) => `${p.x * viewBoxSize},${p.y * viewBoxSize}`)
    .join(" ");
}

function scrollToZone(zoneSlug: string) {
  const el = document.getElementById(zoneAnchorId(zoneSlug));
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export default function GlanceBoardMinimapSidebar({
  minimapUrl,
  zones,
  density,
  viewBoxSize = 1000,
  onZoneClick,
  activeZoneSlug = null,
  lineups,
  pinMode = null,
  selectedLineupId = null,
  onPinSelect,
}: Props) {
  const [minimapFailed, setMinimapFailed] = useState(false);
  const [hoveredZoneSlug, setHoveredZoneSlug] = useState<string | null>(null);

  // Pick the handler once: a filter action (parent-provided) takes
  // precedence over the default scroll-to-section behaviour. The fallback
  // text list and the polygon ``onClick`` both use the same handler so the
  // two surfaces stay consistent.
  const handleZoneClick = onZoneClick ?? scrollToZone;
  const usingFilterMode = onZoneClick !== undefined;

  // Fallback: text zone list when minimap unavailable
  if (!minimapUrl || minimapFailed) {
    return (
      <nav
        className="flex flex-col gap-1 overflow-y-auto"
        aria-label="Zone navigation"
      >
        <p className="text-[11px] text-muted-foreground px-1 pb-1 font-medium uppercase tracking-wide">
          Zones
        </p>
        {zones.map((zone) => {
          const count = density[zone.id]?.count ?? 0;
          const isActive = usingFilterMode && zone.slug === activeZoneSlug;
          return (
            <button
              key={zone.id}
              type="button"
              onClick={() => handleZoneClick(zone.slug)}
              aria-pressed={usingFilterMode ? isActive : undefined}
              className={[
                "text-left px-2 py-1 rounded text-[12px] hover:bg-muted/40 transition-colors flex items-center justify-between gap-2",
                isActive && "bg-primary/15 text-primary font-medium",
              ].filter(Boolean).join(" ")}
            >
              <span className="truncate">{zone.name}</span>
              {count > 0 && (
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      className="relative rounded-lg border overflow-hidden bg-card"
      style={{ aspectRatio: "1 / 1" }}
      aria-label={
        usingFilterMode
          ? "Zone minimap — click a zone to filter, click again to clear"
          : "Zone minimap — click a zone to scroll to it"
      }
    >
      <img
        src={minimapUrl}
        alt="Map minimap"
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
        onError={() => setMinimapFailed(true)}
      />
      <svg
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        className="absolute inset-0 w-full h-full"
        style={{ overflow: "visible" }}
      >
        {zones.map((zone) => {
          const count = density[zone.id]?.count ?? 0;
          const isHovered = zone.slug === hoveredZoneSlug;
          const isActive = usingFilterMode && zone.slug === activeZoneSlug;
          const hasPolygon = zone.polygon_points.length > 0;
          if (!hasPolygon) return null;

          const points = pointsToSvg(zone.polygon_points, viewBoxSize);
          // Priority: active (filter selection) > hover > density. Active
          // wins so the filtered zone stays visually anchored even while
          // the operator hovers other zones to see counts.
          const fill = isActive
            ? FILL_ACTIVE
            : isHovered
              ? FILL_HOVER
              : count > 0
                ? FILL_HAS_LINEUPS
                : FILL_EMPTY;
          const stroke = isActive
            ? STROKE_ACTIVE
            : isHovered
              ? STROKE_HOVER
              : count > 0
                ? STROKE_HAS_LINEUPS
                : STROKE_EMPTY;
          const strokeWidth = isActive ? 2.5 : isHovered ? 2 : 1;

          const ariaLabelBase = `${zone.name} — ${count} lineup${count !== 1 ? "s" : ""}`;
          const ariaLabelAction = usingFilterMode
            ? isActive
              ? " — currently filtered (click to clear)"
              : " — click to filter"
            : " — click to scroll";

          return (
            <polygon
              key={zone.id}
              points={points}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              className="cursor-pointer transition-all duration-150"
              onClick={() => handleZoneClick(zone.slug)}
              onMouseEnter={() => setHoveredZoneSlug(zone.slug)}
              onMouseLeave={() => setHoveredZoneSlug(null)}
              aria-label={`${ariaLabelBase}${ariaLabelAction}`}
              aria-pressed={usingFilterMode ? isActive : undefined}
            />
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hoveredZoneSlug && (() => {
        const zone = zones.find((z) => z.slug === hoveredZoneSlug);
        if (!zone) return null;
        const count = density[zone.id]?.count ?? 0;
        return (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none z-10 px-2 py-1 rounded-md bg-popover border text-xs shadow-md whitespace-nowrap">
            <span className="font-semibold">{zone.name}</span>
            <span className="ml-1.5 text-muted-foreground">
              {count} lineup{count !== 1 ? "s" : ""}
            </span>
          </div>
        );
      })()}

      {/* Lineup-pin overlay — only in the image branch (this render path is
          inherently !minimapFailed). Aligns with zones via the shared 1000×
          viewBox. */}
      {pinMode && lineups && onPinSelect && (
        <MapLineupPins
          lineups={lineups}
          mode={pinMode}
          selectedLineupId={selectedLineupId}
          onPinSelect={onPinSelect}
          viewBoxSize={viewBoxSize}
        />
      )}
    </nav>
  );
}
