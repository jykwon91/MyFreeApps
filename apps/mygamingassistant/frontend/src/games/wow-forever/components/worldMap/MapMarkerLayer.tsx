import { memo, type KeyboardEvent, type ReactNode } from "react";
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
  /** The map's zoom: markers, labels and lines are drawn this much smaller so they keep their size on screen. */
  scale?: number;
}

interface Px {
  px: number;
  py: number;
}

interface Leg {
  points: Px[];
  kind: StepKind;
  /** The step this leg ends at. */
  number: number;
}

/** Walking solid, flights dashed, boats, zeppelins and the tram dotted. */
const LEG_DASH: Readonly<Record<StepKind, string | undefined>> = {
  walk: undefined,
  fly: "14 9",
  boat: "2 10",
  zeppelin: "2 10",
  tram: "2 10",
};

/** Scales a "1 2" dash pattern to the zoom. */
function scaledDash(dash: string | undefined, scale: number): string | undefined {
  return dash?.split(" ").map((n) => Number(n) / scale).join(" ");
}

/** Keeps what's inside the same size on screen however far the map is zoomed, around its point. */
function Pinned({ at, scale, children }: { at: Px; scale: number; children: ReactNode }) {
  if (scale === 1) return <>{children}</>;
  return <g transform={`translate(${at.px} ${at.py}) scale(${1 / scale}) translate(${-at.px} ${-at.py})`}>{children}</g>;
}

function toPx(map: MapView, p: WorldPoint): Px | null {
  const at = worldToMap(map, p);
  return at && { px: (at.x / 100) * MAP_W, py: (at.y / 100) * MAP_H };
}

function samePoint(a: WorldPoint, b: WorldPoint): boolean {
  return a.continent === b.continent && Math.abs(a.wx - b.wx) < 1 && Math.abs(a.wy - b.wy) < 1;
}

/** One leg per step, from the previous stop (or A): a walk's path when it has one, else a straight line. */
function routeLegs(map: MapView, route: MapRoute | null): Leg[] {
  if (!route?.origin) return [];
  const legs: Leg[] = [];
  let prev = toPx(map, route.origin.world);
  for (const stop of route.stops) {
    const at = toPx(map, stop.world);
    const path = stop.path?.flatMap((p) => toPx(map, p) ?? []);
    if (path && path.length > 1) legs.push({ points: path, kind: stop.kind, number: stop.number });
    else if (prev && at) legs.push({ points: [prev, at], kind: stop.kind, number: stop.number });
    prev = at;
  }
  return legs;
}

function pointList(points: readonly Px[]): string {
  return points.map((p) => `${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(" ");
}

/**
 * Everything drawn over the map picture, bottom to top: the route (A ->
 * numbered stops -> B), the stops, the results, the chosen result (bigger,
 * pulsing, named), you, and the trip's A and B. Memoised: hovering the map
 * re-renders the canvas, not every marker.
 */
function MapMarkerLayer({ map, player, markers, selectedId, route, onSelectMarker, scale = 1 }: MapMarkerLayerProps) {
  const shown = (p: WorldPoint | null | undefined): p is WorldPoint => !!p && mapShows(map, p);
  const you = shown(player) ? toPx(map, player) : null;
  const destination = route?.destination ?? null;
  const origin = route?.origin ?? null;
  const b = destination && shown(destination.world) ? toPx(map, destination.world) : null;
  const a = origin && shown(origin.world) ? toPx(map, origin.world) : null;
  const highlight = route?.highlight ?? null;
  // The highlighted leg is drawn last, over the others.
  const legs = routeLegs(map, route).sort((a, b) => Number(a.number === highlight) - Number(b.number === highlight));
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
          {legs.map((leg) => (
            <polyline
              key={`halo-${leg.number}`}
              points={pointList(leg.points)}
              fill="none"
              strokeWidth={(leg.number === highlight ? 12 : 8) / scale}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-black/60"
            />
          ))}
          {legs.map((leg) => (
            <polyline
              key={`leg-${leg.number}`}
              data-testid={`route-leg-${leg.number}`}
              points={pointList(leg.points)}
              fill="none"
              strokeWidth={(leg.number === highlight ? 6 : 4) / scale}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={scaledDash(LEG_DASH[leg.kind], scale)}
              className={leg.number === highlight ? "stroke-amber-300" : "stroke-white"}
            />
          ))}
        </g>
      )}
      {stops.map((s) => {
        const at = toPx(map, s.world);
        if (!at) return null;
        return (
          <g key={`stop-${s.number}`} aria-label={`Step ${s.number}: ${s.label}`}>
            <Pinned at={at} scale={scale}>
              <circle cx={at.px} cy={at.py} r={14} strokeWidth={3} className="fill-amber-400 stroke-black/70" />
              <text x={at.px} y={at.py + 6} textAnchor="middle" className="fill-black text-[18px] font-bold">
                {s.number}
              </text>
            </Pinned>
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
            <Pinned at={at} scale={scale}>
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
            </Pinned>
          </g>
        );
      })}
      {you && (
        <g aria-label="You" className="pointer-events-none">
          <Pinned at={you} scale={scale}>
            <circle cx={you.px} cy={you.py} r={16} className="fill-blue-500/30" />
            <circle cx={you.px} cy={you.py} r={8} strokeWidth={3} className="fill-blue-600 stroke-white" />
          </Pinned>
        </g>
      )}
      {a && origin && (
        <Pinned at={a} scale={scale}>
          <TripEndMarker at={a} letter="A" label={`Start: ${origin.label}`} name={origin.label} start />
        </Pinned>
      )}
      {b && destination && (
        <Pinned at={b} scale={scale}>
          <TripEndMarker at={b} letter="B" label={`Destination: ${destination.label}`} name={destination.label} />
        </Pinned>
      )}
    </>
  );
}

export default memo(MapMarkerLayer);
