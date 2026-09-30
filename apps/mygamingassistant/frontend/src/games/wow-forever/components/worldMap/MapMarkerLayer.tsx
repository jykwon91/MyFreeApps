import { memo, type KeyboardEvent } from "react";
import clsx from "clsx";
import MapPointLabel from "@/games/wow-forever/components/worldMap/MapPointLabel";
import TripEndMarker from "@/games/wow-forever/components/worldMap/TripEndMarker";
import type { MapView, WorldPoint } from "@/games/wow-forever/types/worldMap";
import { mapShows, worldToMap } from "@/games/wow-forever/worldMap/mapGeometry";
import type { StepKind } from "@/games/wow-forever/worldMap/directions";
import type { MapMarker, MapRoute } from "@/games/wow-forever/worldMap/mapLayers";

/** The client's world-map canvas size — the art in /public/wow-maps is drawn at this size. */
export const MAP_W = 1002;
export const MAP_H = 668;

interface MapMarkerLayerProps {
  map: MapView;
  player: WorldPoint | null;
  /** Result markers — drawn on zone and city maps only. */
  markers: readonly MapMarker[];
  selectedId: string | null;
  /** The trip: destination (B), and once directions are open the start (A) and the stops between. */
  route: MapRoute | null;
  onSelectMarker: (id: string) => void;
}

interface Px {
  px: number;
  py: number;
}

interface Leg {
  from: Px;
  to: Px;
  kind: StepKind;
}

/** Walking solid, flights dashed, boats and zeppelins dotted. */
const LEG_DASH: Readonly<Record<StepKind, string | undefined>> = {
  walk: undefined,
  fly: "14 9",
  boat: "2 10",
  zeppelin: "2 10",
};

function toPx(map: MapView, p: WorldPoint): Px | null {
  const at = worldToMap(map, p);
  return at && { px: (at.x / 100) * MAP_W, py: (at.y / 100) * MAP_H };
}

function samePoint(a: WorldPoint, b: WorldPoint): boolean {
  return a.continent === b.continent && Math.abs(a.wx - b.wx) < 1 && Math.abs(a.wy - b.wy) < 1;
}

/** One leg per step, from the previous stop (or A). */
function routeLegs(map: MapView, route: MapRoute | null): Leg[] {
  if (!route?.origin) return [];
  const legs: Leg[] = [];
  let prev = toPx(map, route.origin.world);
  for (const stop of route.stops) {
    const at = toPx(map, stop.world);
    if (prev && at) legs.push({ from: prev, to: at, kind: stop.kind });
    prev = at;
  }
  return legs;
}

/**
 * Everything drawn over the map picture, bottom to top: the route (A ->
 * numbered stops -> B), the stops, the results, the chosen result (bigger,
 * pulsing, named), you, and the trip's A and B. Memoised: hovering the map
 * re-renders the canvas, not every marker.
 */
function MapMarkerLayer({ map, player, markers, selectedId, route, onSelectMarker }: MapMarkerLayerProps) {
  const shown = (p: WorldPoint | null | undefined): p is WorldPoint => !!p && mapShows(map, p);
  const you = shown(player) ? toPx(map, player) : null;
  const destination = route?.destination ?? null;
  const origin = route?.origin ?? null;
  const b = destination && shown(destination.world) ? toPx(map, destination.world) : null;
  const a = origin && shown(origin.world) ? toPx(map, origin.world) : null;
  const legs = routeLegs(map, route);
  // B stands on the last stop; its own marker names it.
  const stops = (route?.stops ?? []).filter((s) => shown(s.world) && !(destination && samePoint(s.world, destination.world)));
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
      {legs.length > 0 && (
        <g className="pointer-events-none" aria-hidden>
          {legs.map((leg, i) => (
            <line
              key={`halo-${i}`}
              x1={leg.from.px}
              y1={leg.from.py}
              x2={leg.to.px}
              y2={leg.to.py}
              strokeWidth={8}
              strokeLinecap="round"
              className="stroke-black/60"
            />
          ))}
          {legs.map((leg, i) => (
            <line
              key={`leg-${i}`}
              x1={leg.from.px}
              y1={leg.from.py}
              x2={leg.to.px}
              y2={leg.to.py}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={LEG_DASH[leg.kind]}
              className="stroke-white"
            />
          ))}
        </g>
      )}
      {stops.map((s) => {
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
            {selected && !b && <MapPointLabel x={at.px} y={at.py} text={m.label} />}
          </g>
        );
      })}
      {you && (
        <g aria-label="You" className="pointer-events-none">
          <circle cx={you.px} cy={you.py} r={16} className="fill-blue-500/30" />
          <circle cx={you.px} cy={you.py} r={8} strokeWidth={3} className="fill-blue-600 stroke-white" />
        </g>
      )}
      {a && origin && <TripEndMarker at={a} letter="A" label={`Start: ${origin.label}`} name={origin.label} start />}
      {b && destination && <TripEndMarker at={b} letter="B" label={`Destination: ${destination.label}`} name={destination.label} />}
    </>
  );
}

export default memo(MapMarkerLayer);
