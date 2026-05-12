/**
 * MapZoneOverlay — renders zone polygons over the map minimap as SVG.
 *
 * Density coloring (always-visible, per UX spec):
 *   count > 0  → semi-transparent green fill + brighter border
 *   count == 0 → grey fill + dim border
 *
 * Click zone → triggers onZoneClick(zone.slug).
 * Hover zone → shows tooltip with lineup count + by_utility breakdown.
 */
import { useState } from "react";
import type { MapZone, ZoneDensity } from "@/types/game";

interface Props {
  zones: MapZone[];
  density: ZoneDensity;
  selectedZoneSlug: string | null;
  onZoneClick: (zoneSlug: string) => void;
  /** viewBox dimensions — defaults to 1000x1000 normalized space */
  viewBoxSize?: number;
}

const FILL_HAS_LINEUPS = "rgba(34,197,94,0.18)";
const FILL_EMPTY = "rgba(156,163,175,0.10)";
const STROKE_HAS_LINEUPS = "rgba(34,197,94,0.7)";
const STROKE_EMPTY = "rgba(255,255,255,0.25)";
const STROKE_SELECTED = "rgba(251,191,36,0.9)";
const FILL_SELECTED = "rgba(251,191,36,0.18)";

function pointsToSvg(
  polygon_points: Array<{ x: number; y: number }>,
  viewBoxSize: number,
): string {
  return polygon_points
    .map((p) => `${p.x * viewBoxSize},${p.y * viewBoxSize}`)
    .join(" ");
}

interface TooltipState {
  zone: MapZone;
  x: number;
  y: number;
}

export default function MapZoneOverlay({
  zones,
  density,
  selectedZoneSlug,
  onZoneClick,
  viewBoxSize = 1000,
}: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  function handleMouseEnter(
    zone: MapZone,
    e: React.MouseEvent<SVGPolygonElement>,
  ) {
    const rect = (e.currentTarget.closest("svg") as SVGSVGElement)
      ?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      zone,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }

  function handleMouseMove(
    _zone: MapZone,
    e: React.MouseEvent<SVGPolygonElement>,
  ) {
    const rect = (e.currentTarget.closest("svg") as SVGSVGElement)
      ?.getBoundingClientRect();
    if (!rect) return;
    setTooltip((prev) =>
      prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : null,
    );
  }

  function handleMouseLeave() {
    setTooltip(null);
  }

  return (
    <div className="relative w-full h-full">
      <svg
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        className="absolute inset-0 w-full h-full"
        style={{ overflow: "visible" }}
      >
        {zones.map((zone) => {
          const data = density[zone.id];
          const count = data?.count ?? 0;
          const isSelected = zone.slug === selectedZoneSlug;
          const points = pointsToSvg(zone.polygon_points, viewBoxSize);

          const fill = isSelected
            ? FILL_SELECTED
            : count > 0
              ? FILL_HAS_LINEUPS
              : FILL_EMPTY;
          const stroke = isSelected
            ? STROKE_SELECTED
            : count > 0
              ? STROKE_HAS_LINEUPS
              : STROKE_EMPTY;

          return (
            <polygon
              key={zone.id}
              points={points}
              fill={fill}
              stroke={stroke}
              strokeWidth={isSelected ? 2 : 1}
              className="cursor-pointer transition-all duration-150 hover:brightness-125"
              onClick={() => onZoneClick(zone.slug)}
              onMouseEnter={(e) => handleMouseEnter(zone, e)}
              onMouseMove={(e) => handleMouseMove(zone, e)}
              onMouseLeave={handleMouseLeave}
              aria-label={`${zone.name} — ${count} lineup${count !== 1 ? "s" : ""}`}
            />
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (() => {
        const data = density[tooltip.zone.id];
        const count = data?.count ?? 0;
        const byUtil = data?.by_utility ?? {};
        return (
          <div
            className="pointer-events-none absolute z-20 px-2.5 py-1.5 rounded-md bg-popover border text-xs shadow-md"
            style={{
              left: tooltip.x + 12,
              top: tooltip.y - 8,
              maxWidth: 180,
            }}
          >
            <p className="font-semibold mb-0.5">{tooltip.zone.name}</p>
            <p className="text-muted-foreground">
              {count} lineup{count !== 1 ? "s" : ""}
            </p>
            {Object.keys(byUtil).length > 0 && (
              <ul className="mt-0.5 space-y-0.5">
                {Object.entries(byUtil).map(([util, n]) => (
                  <li key={util} className="text-muted-foreground capitalize">
                    {util}: {n}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })()}
    </div>
  );
}
