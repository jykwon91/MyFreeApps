import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import clsx from "clsx";
import { useMinimapZoomPan } from "@/hooks/useMinimapZoomPan";
import MapGrid from "@/games/wow-forever/components/worldMap/MapGrid";
import type { WorldPoint, WorldZone } from "@/games/wow-forever/types/worldMap";
import { formatCoord, worldToZone, zoneShows } from "@/games/wow-forever/worldMap/geometry";

/** The client's world-map canvas size — the art in /public/wow-maps is drawn at this size. */
const MAP_W = 1002;
const MAP_H = 668;
/** Pointer travel (px) that turns a click into a drag. */
const CLICK_SLOP = 6;

export interface ZoneMapMarker {
  id: string;
  world: WorldPoint;
  label: string;
  className: string;
}

export interface ZoneMapStop {
  world: WorldPoint;
  number: number;
  label: string;
}

interface ZoneMapProps {
  zone: WorldZone;
  player: WorldPoint | null;
  markers: readonly ZoneMapMarker[];
  selectedId: string | null;
  destination: { world: WorldPoint; label: string } | null;
  stops: readonly ZoneMapStop[];
  onPick: (x: number, y: number) => void;
  onSelectMarker: (id: string) => void;
}

/**
 * One zone's in-game map with you, the results, the chosen destination and
 * the numbered direction stops. Click the map to say where you are; scroll
 * to zoom, drag to pan. Anything whose world position is drawn on this map
 * shows — so Stormwind's trainers appear on the Elwynn Forest map too.
 */
export default function ZoneMap({ zone, player, markers, selectedId, destination, stops, onPick, onSelectMarker }: ZoneMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoom = useMinimapZoomPan(containerRef);
  const [imageFailed, setImageFailed] = useState(false);
  const down = useRef<{ x: number; y: number } | null>(null);

  const toPx = (p: WorldPoint) => {
    const { x, y } = worldToZone(zone, p);
    return { px: (x / 100) * MAP_W, py: (y / 100) * MAP_H };
  };
  const onMap = (p: WorldPoint | null | undefined): p is WorldPoint => !!p && zoneShows(zone, p);

  function pointerDown(e: PointerEvent<HTMLDivElement>) {
    down.current = { x: e.clientX, y: e.clientY };
    zoom.onPanStart(e);
  }

  function pointerUp(e: PointerEvent<HTMLDivElement>) {
    zoom.onPanEnd(e);
    const start = down.current;
    down.current = null;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!start || !rect || Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (x >= 0 && x <= 100 && y >= 0 && y <= 100) onPick(Number(formatCoord(x)), Number(formatCoord(y)));
  }

  function markerKey(e: KeyboardEvent, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelectMarker(id);
    }
  }

  const you = onMap(player) ? toPx(player) : null;
  const dest = destination && onMap(destination.world) ? toPx(destination.world) : null;

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        data-testid="zone-map"
        className={clsx(
          "relative w-full overflow-hidden rounded-xl border bg-muted/40 touch-none select-none",
          zoom.panning && "cursor-grabbing",
          !zoom.panning && "cursor-crosshair",
        )}
        style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}
        onPointerDown={pointerDown}
        onPointerMove={zoom.onPanMove}
        onPointerUp={pointerUp}
      >
        <div className="absolute inset-0" style={zoom.transformStyle}>
          {!imageFailed && (
            <img
              src={`/wow-maps/${zone.id}.webp`}
              alt={`${zone.name} map`}
              draggable={false}
              onError={() => setImageFailed(true)}
              className="absolute inset-0 h-full w-full"
            />
          )}
          <svg ref={svgRef} viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="absolute inset-0 h-full w-full" role="group" aria-label={`${zone.name} markers`}>
            {imageFailed && <MapGrid width={MAP_W} height={MAP_H} />}
            {you && dest && (
              <line x1={you.px} y1={you.py} x2={dest.px} y2={dest.py} strokeWidth={4} strokeDasharray="12 8" className="stroke-primary" />
            )}
            {markers.filter((m) => onMap(m.world)).map((m) => {
              const { px, py } = toPx(m.world);
              const selected = m.id === selectedId;
              return (
                <g
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  aria-label={m.label}
                  aria-pressed={selected}
                  className="cursor-pointer focus:outline-none"
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  onClick={() => onSelectMarker(m.id)}
                  onKeyDown={(e) => markerKey(e, m.id)}
                >
                  <title>{m.label}</title>
                  <circle cx={px} cy={py} r={selected ? 13 : 9} strokeWidth={3} className={clsx(m.className, "stroke-white")} />
                </g>
              );
            })}
            {stops.filter((s) => onMap(s.world)).map((s) => {
              const { px, py } = toPx(s.world);
              return (
                <g key={`stop-${s.number}`} aria-label={`Step ${s.number}: ${s.label}`}>
                  <circle cx={px} cy={py} r={14} strokeWidth={3} className="fill-amber-400 stroke-black/70" />
                  <text x={px} y={py + 6} textAnchor="middle" className="fill-black text-[18px] font-bold">
                    {s.number}
                  </text>
                </g>
              );
            })}
            {you && (
              <g aria-label="You">
                <circle cx={you.px} cy={you.py} r={16} className="fill-blue-500/30" />
                <circle cx={you.px} cy={you.py} r={8} strokeWidth={3} className="fill-blue-600 stroke-white" />
              </g>
            )}
          </svg>
        </div>
        {zoom.isZoomed && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={zoom.reset}
            className="absolute right-2 top-2 rounded-md border bg-card/90 px-3 text-xs min-h-[36px]"
          >
            Reset zoom
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-blue-600">●</span> You ·{" "}
        <span className="font-medium text-amber-500">●</span> direction steps · coloured dots are results. Click the map to set where
        you are; scroll to zoom, drag to move.
      </p>
      {imageFailed && <p className="text-xs text-muted-foreground">The map picture didn't load — showing a grid instead.</p>}
    </div>
  );
}

