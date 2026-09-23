import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import clsx from "clsx";
import { useMinimapZoomPan } from "@/hooks/useMinimapZoomPan";
import MapEdgeLabels from "@/games/wow-forever/components/worldMap/MapEdgeLabels";
import MapGrid from "@/games/wow-forever/components/worldMap/MapGrid";
import MapHoverHighlight from "@/games/wow-forever/components/worldMap/MapHoverHighlight";
import MapHoverStatus from "@/games/wow-forever/components/worldMap/MapHoverStatus";
import MapMarkerLayer, { MAP_H, MAP_W } from "@/games/wow-forever/components/worldMap/MapMarkerLayer";
import type { MapView, PlayerFaction, WorldMapData, WorldPoint } from "@/games/wow-forever/types/worldMap";
import { formatCoord } from "@/games/wow-forever/worldMap/geometry";
import { worldToMap } from "@/games/wow-forever/worldMap/mapGeometry";
import { HIT_KIND, hitTestMap, neighbourLabels, type MapHit } from "@/games/wow-forever/worldMap/mapHitTest";
import type { MapDestination, MapFocus, MapMarker, MapStop } from "@/games/wow-forever/worldMap/mapLayers";

/** Pointer travel (px) that turns a click into a drag. */
const CLICK_SLOP = 6;
/** How far "show on map" zooms in. */
const FOCUS_SCALE = 2.5;

interface MapCanvasProps {
  data: WorldMapData;
  map: MapView;
  faction: PlayerFaction;
  player: WorldPoint | null;
  markers: readonly MapMarker[];
  selectedId: string | null;
  destination: MapDestination | null;
  stops: readonly MapStop[];
  focus: MapFocus | null;
  onFocusApplied: () => void;
  onOpen: (mapId: number) => void;
  onZoomOut: () => void;
  /** A click on the viewed zone itself, in its map percent. */
  onPick: (x: number, y: number) => void;
  onSelectMarker: (id: string) => void;
}

function sameHit(a: MapHit | null, b: MapHit): boolean {
  return !!a && a.kind === b.kind && a.target?.id === b.target?.id;
}

/**
 * One map of the zoom-out tree with its art, the route and the results.
 * Like the in-game map: hover a zone to light it up, click to open it,
 * right-click or Esc to zoom out; on a zone map the neighbours are named at
 * the edges and a click past a border opens that zone. Scroll to zoom, drag
 * to pan.
 */
export default function MapCanvas(props: MapCanvasProps) {
  const { data, map, faction, focus, onFocusApplied, onOpen, onZoomOut, onPick } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoom = useMinimapZoomPan(containerRef);
  const { focusOn } = zoom;
  const [imageFailed, setImageFailed] = useState(false);
  const [hover, setHover] = useState<MapHit | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const edgeLabels = useMemo(() => neighbourLabels(data, map.id), [data, map.id]);

  // "Show on map" from the list: centre + zoom to the chosen marker.
  useEffect(() => {
    if (!focus || focus.mapId !== map.id) return;
    const marker = props.markers.find((m) => m.id === focus.poiId);
    const at = marker && worldToMap(map, marker.world);
    if (at) focusOn(at.x / 100, at.y / 100, FOCUS_SCALE);
    onFocusApplied();
  }, [focus, map, props.markers, focusOn, onFocusApplied]);

  /** Map percent under the pointer (the art is transformed with the markers, so its box is the map's). */
  function percentAt(e: PointerEvent<HTMLDivElement>): { x: number; y: number } | null {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 };
  }

  function pointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    down.current = { x: e.clientX, y: e.clientY };
    zoom.onPanStart(e);
  }

  function pointerMove(e: PointerEvent<HTMLDivElement>) {
    zoom.onPanMove(e);
    if (zoom.panning) return;
    const at = percentAt(e);
    if (!at) return;
    const hit = hitTestMap(data, map.id, at.x, at.y);
    if (!sameHit(hover, hit)) setHover(hit);
  }

  function pointerUp(e: PointerEvent<HTMLDivElement>) {
    zoom.onPanEnd(e);
    const start = down.current;
    down.current = null;
    const at = percentAt(e);
    if (!start || !at || Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP) return;
    const hit = hitTestMap(data, map.id, at.x, at.y);
    if (hit.kind === HIT_KIND.goTo && hit.target) onOpen(hit.target.id);
    if (hit.kind === HIT_KIND.here) onPick(Number(formatCoord(at.x)), Number(formatCoord(at.y)));
  }

  function contextMenu(e: MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    onZoomOut();
  }

  function keyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    onZoomOut();
  }

  const goTo = hover?.kind === HIT_KIND.goTo ? hover.target : null;

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        data-testid="zone-map"
        tabIndex={0}
        aria-label={`${map.name} — right-click or press Escape to zoom out`}
        className={clsx(
          "relative w-full overflow-hidden rounded-xl border bg-muted/40 touch-none select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500",
          zoom.panning && "cursor-grabbing",
          !zoom.panning && goTo && "cursor-pointer",
          !zoom.panning && hover?.kind === HIT_KIND.here && "cursor-crosshair",
        )}
        style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerLeave={() => setHover(null)}
        onContextMenu={contextMenu}
        onKeyDown={keyDown}
      >
        <div className="absolute inset-0" style={zoom.transformStyle}>
          {!imageFailed && (
            <img
              src={`/wow-maps/${map.id}.webp`}
              alt={`${map.name} map`}
              draggable={false}
              decoding="async"
              onError={() => setImageFailed(true)}
              className="absolute inset-0 h-full w-full"
            />
          )}
          {goTo && <MapHoverHighlight map={map} target={goTo} faction={faction} />}
          <svg
            ref={svgRef}
            viewBox={`0 0 ${MAP_W} ${MAP_H}`}
            className="absolute inset-0 h-full w-full"
            role="group"
            aria-label={`${map.name} markers`}
          >
            {imageFailed && <MapGrid width={MAP_W} height={MAP_H} />}
            <MapMarkerLayer
              map={map}
              player={props.player}
              markers={props.markers}
              selectedId={props.selectedId}
              destination={props.destination}
              stops={props.stops}
              onSelectMarker={props.onSelectMarker}
            />
          </svg>
        </div>
        <MapEdgeLabels labels={edgeLabels} onOpen={onOpen} />
        {zoom.isZoomed && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={zoom.reset}
            className="absolute right-2 top-12 z-10 rounded-md border bg-card px-3 text-xs min-h-[36px]"
          >
            Reset zoom
          </button>
        )}
      </div>
      <MapHoverStatus map={map} hover={hover} faction={faction} />
      {imageFailed && <p className="text-xs text-muted-foreground">The map picture didn't load — showing a grid instead.</p>}
    </div>
  );
}
