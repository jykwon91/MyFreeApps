import { memo, type KeyboardEvent } from "react";
import clsx from "clsx";
import MapPointLabel from "@/games/wow-forever/components/worldMap/MapPointLabel";
import type { MapView, WorldPoint } from "@/games/wow-forever/types/worldMap";
import { mapShows, worldToMap } from "@/games/wow-forever/worldMap/mapGeometry";
import type { MapDestination, MapMarker, MapStop } from "@/games/wow-forever/worldMap/mapLayers";

/** The client's world-map canvas size — the art in /public/wow-maps is drawn at this size. */
export const MAP_W = 1002;
export const MAP_H = 668;

interface MapMarkerLayerProps {
  map: MapView;
  player: WorldPoint | null;
  /** Result markers — drawn on zone and city maps only. */
  markers: readonly MapMarker[];
  selectedId: string | null;
  destination: MapDestination | null;
  stops: readonly MapStop[];
  onSelectMarker: (id: string) => void;
}

interface Px {
  px: number;
  py: number;
}

function toPx(map: MapView, p: WorldPoint): Px | null {
  const at = worldToMap(map, p);
  return at && { px: (at.x / 100) * MAP_W, py: (at.y / 100) * MAP_H };
}

/**
 * Everything drawn over the map picture, bottom to top: the route (you ->
 * numbered stops -> destination), the stops, the results, the chosen result
 * (bigger, pulsing, named) and you. Memoised: hovering the map re-renders
 * the canvas, not every marker.
 */
function MapMarkerLayer({ map, player, markers, selectedId, destination, stops, onSelectMarker }: MapMarkerLayerProps) {
  const shown = (p: WorldPoint | null | undefined): p is WorldPoint => !!p && mapShows(map, p);
  const you = shown(player) ? toPx(map, player) : null;
  const dest = destination && shown(destination.world) ? toPx(map, destination.world) : null;
  const route = [player, ...stops.map((s) => s.world), destination?.world]
    .flatMap((p) => (p ? [toPx(map, p)] : []))
    .flatMap((p) => (p ? [`${p.px},${p.py}`] : []))
    .join(" ");
  const visible = markers.filter((m) => shown(m.world));
  const selectedMarker = visible.find((m) => m.id === selectedId);
  // The chosen result is drawn last so nothing covers it.
  const ordered = [...visible.filter((m) => m !== selectedMarker), ...(selectedMarker ? [selectedMarker] : [])];

  function markerKey(e: KeyboardEvent, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelectMarker(id);
    }
  }

  return (
    <>
      {destination && route.includes(" ") && (
        <g className="pointer-events-none" aria-hidden>
          <polyline points={route} fill="none" strokeWidth={8} strokeLinejoin="round" className="stroke-black/60" />
          <polyline points={route} fill="none" strokeWidth={4} strokeDasharray="14 9" strokeLinejoin="round" className="stroke-white" />
        </g>
      )}
      {stops.filter((s) => shown(s.world)).map((s) => {
        const at = toPx(map, s.world);
        if (!at) return null;
        return (
          <g key={`stop-${s.number}`} aria-label={`Step ${s.number}: ${s.label}`}>
            <circle cx={at.px} cy={at.py} r={14} strokeWidth={3} className="fill-amber-400 stroke-black/70" />
            <text x={at.px} y={at.py + 6} textAnchor="middle" className="fill-black text-[18px] font-bold">
              {s.number}
            </text>
          </g>
        );
      })}
      {dest && destination && !selectedMarker && (
        <g aria-label={`Destination: ${destination.label}`} className="pointer-events-none">
          <circle cx={dest.px} cy={dest.py} r={13} strokeWidth={4} className="fill-fuchsia-500 stroke-white" />
          <MapPointLabel x={dest.px} y={dest.py} text={destination.label} />
        </g>
      )}
      {ordered.map((m) => {
        const at = toPx(map, m.world);
        if (!at) return null;
        const selected = m === selectedMarker;
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
            {selected && (
              <circle
                cx={at.px}
                cy={at.py}
                r={22}
                strokeWidth={4}
                className="fill-none stroke-white motion-safe:animate-ping [transform-box:fill-box] [transform-origin:center]"
              />
            )}
            {selected && <circle cx={at.px} cy={at.py} r={21} strokeWidth={5} className="fill-black/25 stroke-white" />}
            <circle cx={at.px} cy={at.py} r={selected ? 14 : 9} strokeWidth={3} className={clsx(m.className, "stroke-white")} />
            {selected && <MapPointLabel x={at.px} y={at.py} text={destination?.label ?? m.label} />}
          </g>
        );
      })}
      {you && (
        <g aria-label="You" className="pointer-events-none">
          <circle cx={you.px} cy={you.py} r={16} className="fill-blue-500/30" />
          <circle cx={you.px} cy={you.py} r={8} strokeWidth={3} className="fill-blue-600 stroke-white" />
        </g>
      )}
    </>
  );
}

export default memo(MapMarkerLayer);
