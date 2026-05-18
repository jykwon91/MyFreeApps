/**
 * GlanceBoardMinimapSidebar — passive spatial index for the glance board.
 *
 * Renders the minimap image with zone SVG polygons (density coloring,
 * same as MapZoneOverlay). Clicking or hovering a zone smooth-scrolls
 * the main board area to that zone's section header.
 *
 * No filter-gate behavior — this is read-only spatial navigation only.
 *
 * Fallback: if the minimap image fails to load, renders a scrollable text
 * list of zone names that still trigger scroll-to-section on click.
 */
import { useState } from "react";
import type { MapZone, ZoneDensity } from "@/types/game";
import { zoneAnchorId } from "./glanceBoardUtils";

interface Props {
  minimapUrl: string | null;
  zones: MapZone[];
  density: ZoneDensity;
  viewBoxSize?: number;
}

// Density fill/stroke — same tokens as MapZoneOverlay
const FILL_HAS_LINEUPS   = "rgba(34,197,94,0.18)";
const FILL_EMPTY         = "rgba(156,163,175,0.10)";
const STROKE_HAS_LINEUPS = "rgba(34,197,94,0.7)";
const STROKE_EMPTY       = "rgba(255,255,255,0.25)";
const STROKE_HOVER       = "rgba(251,191,36,0.9)";
const FILL_HOVER         = "rgba(251,191,36,0.18)";

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
}: Props) {
  const [minimapFailed, setMinimapFailed] = useState(false);
  const [hoveredZoneSlug, setHoveredZoneSlug] = useState<string | null>(null);

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
          return (
            <button
              key={zone.id}
              type="button"
              onClick={() => scrollToZone(zone.slug)}
              className="text-left px-2 py-1 rounded text-[12px] hover:bg-muted/40 transition-colors flex items-center justify-between gap-2"
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
      aria-label="Zone minimap — click a zone to scroll to it"
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
          const hasPolygon = zone.polygon_points.length > 0;
          if (!hasPolygon) return null;

          const points = pointsToSvg(zone.polygon_points, viewBoxSize);
          const fill   = isHovered ? FILL_HOVER   : count > 0 ? FILL_HAS_LINEUPS   : FILL_EMPTY;
          const stroke = isHovered ? STROKE_HOVER : count > 0 ? STROKE_HAS_LINEUPS : STROKE_EMPTY;

          return (
            <polygon
              key={zone.id}
              points={points}
              fill={fill}
              stroke={stroke}
              strokeWidth={isHovered ? 2 : 1}
              className="cursor-pointer transition-all duration-150"
              onClick={() => scrollToZone(zone.slug)}
              onMouseEnter={() => setHoveredZoneSlug(zone.slug)}
              onMouseLeave={() => setHoveredZoneSlug(null)}
              aria-label={`${zone.name} — ${count} lineup${count !== 1 ? "s" : ""} — click to scroll`}
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
    </nav>
  );
}
