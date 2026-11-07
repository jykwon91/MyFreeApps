import { memo } from "react";
import MapMarkGlyph from "@/games/wow-forever/components/worldMap/MapMarkGlyph";
import MapPinned from "@/games/wow-forever/components/worldMap/MapPinned";
import { MAP_H, MAP_W } from "@/games/wow-forever/data/worldMap/mapViewer";
import type { MapMarks } from "@/games/wow-forever/types/mapMarks/mapMarks";
import { routeMarks } from "@/games/wow-forever/worldMap/mapMarks";

interface MapMarksLayerProps {
  /** Marks on the viewed map: yours, or a shared set (drawn dashed and read-only). */
  marks: MapMarks;
  shared?: boolean;
  /** The map's zoom: marks keep their size on screen. */
  scale: number;
}

function toPx(x: number, y: number): { px: number; py: number } {
  return { px: (x / 100) * MAP_W, py: (y / 100) * MAP_H };
}

/**
 * A set of marks over the map picture: the route as a line through its
 * numbered stops, then every mark with its glyph and label. Never takes a
 * click — a click on the map keeps meaning what it always did.
 */
function MapMarksLayer({ marks, shared = false, scale }: MapMarksLayerProps) {
  const stops = routeMarks(marks);
  const stopNumber = new Map(stops.map((m, i) => [m.id, i + 1]));
  const line = stops.map((m) => toPx(m.x, m.y));
  const owner = shared ? "Shared mark" : "Your mark";
  return (
    <g
      className="pointer-events-none"
      role="group"
      aria-label={shared ? "Shared marks" : "Your marks"}
      data-testid={shared ? "shared-marks-layer" : "my-marks-layer"}
    >
      {line.length > 1 && (
        <g aria-hidden>
          <polyline
            points={line.map((p) => `${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(" ")}
            fill="none"
            strokeWidth={8 / scale}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-black/60"
          />
          <polyline
            data-testid={shared ? "shared-route-line" : "my-route-line"}
            points={line.map((p) => `${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(" ")}
            fill="none"
            strokeWidth={4 / scale}
            strokeDasharray={shared ? `${10 / scale} ${7 / scale}` : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={shared ? "stroke-violet-300" : "stroke-fuchsia-400"}
          />
        </g>
      )}
      {marks.marks.map((mark) => {
        const at = toPx(mark.x, mark.y);
        const stop = stopNumber.get(mark.id);
        const name = stop ? `${owner} ${mark.label}, route stop ${stop}` : `${owner} ${mark.label}`;
        return (
          <g key={mark.id} role="img" aria-label={name}>
            <title>{name}</title>
            <MapPinned at={at} scale={scale}>
              <MapMarkGlyph at={at} style={mark.style} shared={shared} />
              {stop !== undefined && (
                <g>
                  <circle cx={at.px + 13} cy={at.py - 13} r={10} strokeWidth={2} className="fill-fuchsia-600 stroke-white" />
                  <text x={at.px + 13} y={at.py - 9} textAnchor="middle" className="fill-white text-[12px] font-bold">
                    {stop}
                  </text>
                </g>
              )}
              <text
                x={at.px}
                y={at.py + 30}
                textAnchor="middle"
                strokeWidth={4}
                paintOrder="stroke"
                className="fill-white stroke-black/80 text-[14px] font-semibold"
              >
                {mark.label}
              </text>
            </MapPinned>
          </g>
        );
      })}
    </g>
  );
}

export default memo(MapMarksLayer);
