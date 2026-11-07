import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import MapEdgeFrame from "@/games/wow-forever/components/worldMap/MapEdgeFrame";
import MapGrid from "@/games/wow-forever/components/worldMap/MapGrid";
import MapHoverHighlight from "@/games/wow-forever/components/worldMap/MapHoverHighlight";
import MapHoverStatus from "@/games/wow-forever/components/worldMap/MapHoverStatus";
import MapMarkerLayer from "@/games/wow-forever/components/worldMap/MapMarkerLayer";
import MapZoomControls from "@/games/wow-forever/components/worldMap/MapZoomControls";
import { MAP_H, MAP_W } from "@/games/wow-forever/data/worldMap/mapViewer";
import { MAP_VIEW_KEYS } from "@/games/wow-forever/data/worldMap/mapViewKeys";
import { MAP_VIEWER_STATUS, useMapViewer } from "@/games/wow-forever/hooks/useMapViewer";
import type { MapView, PlayerFaction, WorldMapData, WorldPoint } from "@/games/wow-forever/types/worldMap";
import type { MapViewport } from "@/games/wow-forever/types/mapViewport";
import { formatCoord } from "@/games/wow-forever/worldMap/geometry";
import { worldToMap } from "@/games/wow-forever/worldMap/mapGeometry";
import { revealInViewport } from "@/games/wow-forever/lib/revealInViewport";
import { HIT_KIND, hitTestMap, type MapHit } from "@/games/wow-forever/worldMap/mapHitTest";
import { neighbourLabels } from "@/games/wow-forever/worldMap/mapNeighbours";
import type { MapZoomRestore } from "@/games/wow-forever/hooks/useMapSelection";
import type { MapFit, MapFocus, MapMarker, MapRoute } from "@/games/wow-forever/worldMap/mapLayers";

/** Pointer travel (px) that turns a click into a drag. */
const CLICK_SLOP = 6;
/** How far "show on map" zooms in. */
const FOCUS_SCALE = 2.5;
/** A fitted route fills this much of the map, leaving room round the edges for A and B. */
const FIT_FILL = 0.7;
/**
 * The viewer's own box. Static on purpose: Leaflet adds its classes to this
 * element, and a changing className would make React wipe them.
 */
const VIEWER_CLASS =
  "absolute inset-0 rounded-xl border select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500";

interface MapCanvasProps {
  data: WorldMapData;
  map: MapView;
  faction: PlayerFaction;
  player: WorldPoint | null;
  markers: readonly MapMarker[];
  selectedId: string | null;
  route: MapRoute | null;
  focus: MapFocus | null;
  onFocusApplied: () => void;
  /** Zoom to fit the trip. */
  fit: MapFit | null;
  onFitApplied: () => void;
  /** Put a remembered zoom + pan back (letting go of a selection). */
  restore: MapZoomRestore | null;
  onRestoreApplied: () => void;
  /** Every settled zoom / pan, so the page can remember the view. */
  onZoomChange: (view: MapViewport) => void;
  /** The player zoomed or panned by hand (wheel, pinch, drag, keys, the zoom buttons). */
  onManualZoom: () => void;
  onOpen: (mapId: number) => void;
  onZoomOut: () => void;
  /** A click on the viewed zone itself, in its map percent. */
  onPick: (x: number, y: number) => void;
  onSelectMarker: (id: string) => void;
  /** A numbered marker (several overlapping results) was clicked. */
  onOpenCluster: (members: readonly MapMarker[]) => void;
  /** Clear the selected result. */
  onClearSelection: () => void;
}

function sameHit(a: MapHit | null, b: MapHit): boolean {
  return !!a && a.kind === b.kind && a.target?.id === b.target?.id;
}

/**
 * One map of the zoom-out tree with its art, the route and the results, in a
 * Leaflet viewer: wheel / pinch / +/- to zoom, drag or arrow keys to pan.
 * Like the in-game map: hover a zone to light it up, click to open it,
 * right-click or Esc to zoom out (Esc, or a click, first clears a selected result — and the view goes back to where it
 * was before the selection, unless the player moved it since); on a zone map the neighbours are named at
 * the edges and a click past a border opens that zone.
 */
export default function MapCanvas(props: MapCanvasProps) {
  const { data, map, faction, focus, onFocusApplied, restore, onRestoreApplied, onManualZoom } = props;
  const { onOpen, onZoomOut, onPick, selectedId, onClearSelection } = props;
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewer = useMapViewer(containerRef, { onChange: props.onZoomChange, onWheelZoom: onManualZoom });
  const { focusOn, reset, setView } = viewer;
  const ready = viewer.status === MAP_VIEWER_STATUS.ready;
  const settled = ready || viewer.status === MAP_VIEWER_STATUS.failed;
  const [imageFailed, setImageFailed] = useState(false);
  const [hover, setHover] = useState<MapHit | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  // Fingers on the map: two or more is a pinch, never a click.
  const pointers = useRef(new Set<number>());
  const pinched = useRef(false);
  const revealed = useRef<MapFocus | null>(null);
  const edgeLabels = useMemo(() => neighbourLabels(data, map.id), [data, map.id]);

  // "Show on map" from the list: bring the map on screen at once, centre + zoom once the viewer is up.
  useEffect(() => {
    if (!focus || focus.mapId !== map.id) return;
    // Stacked layout: the list is above the map — bring the map on screen so the zoom is seen.
    if (focus.reveal && revealed.current !== focus) revealInViewport(canvasRef.current);
    revealed.current = focus;
    if (!settled) return;
    const marker = props.markers.find((m) => m.id === focus.poiId);
    const at = marker && worldToMap(map, marker.world);
    if (at) focusOn(at.x / 100, at.y / 100, FOCUS_SCALE);
    onFocusApplied();
  }, [focus, map, props.markers, focusOn, onFocusApplied, settled]);

  // A trip: zoom so its ends (and stops) all show.
  const { fit, onFitApplied } = props;
  useEffect(() => {
    if (!fit || fit.mapId !== map.id || !settled) return;
    const points = fit.points.flatMap((p) => worldToMap(map, p) ?? []);
    const xs = points.map((p) => p.x / 100);
    const ys = points.map((p) => p.y / 100);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const centre = { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 };
    if (!points.length) reset();
    else focusOn(centre.x, centre.y, Math.max(1, Math.min(fit.maxScale ?? FOCUS_SCALE, FIT_FILL / span)));
    onFitApplied();
  }, [fit, map, focusOn, reset, onFitApplied, settled]);

  // Letting go of a selection: back to the zoom + pan from before it.
  useEffect(() => {
    if (!restore || restore.mapId !== map.id || !settled) return;
    setView(restore.zoom);
    onRestoreApplied();
  }, [restore, map.id, setView, onRestoreApplied, settled]);

  /** Map percent under the pointer (the art moves with the markers, so their box is the map's). */
  function percentAt(e: PointerEvent<HTMLDivElement>): { x: number; y: number } | null {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 };
  }

  function pointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    pointers.current.add(e.pointerId);
    if (pointers.current.size > 1) {
      pinched.current = true;
      return;
    }
    pinched.current = false;
    down.current = { x: e.clientX, y: e.clientY };
  }

  function pointerMove(e: PointerEvent<HTMLDivElement>) {
    if (viewer.dragging || pointers.current.size > 1) return;
    const at = percentAt(e);
    if (!at) return;
    const hit = hitTestMap(data, map.id, at.x, at.y);
    if (!sameHit(hover, hit)) setHover(hit);
  }

  function pointerCancel(e: PointerEvent<HTMLDivElement>) {
    // The page took the gesture (a swipe scrolling past the map): no click.
    pointers.current.delete(e.pointerId);
    down.current = null;
  }

  function pointerUp(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    const start = down.current;
    if (pinched.current) {
      // A pinch is a hand zoom; once the last finger lifts it's over.
      if (pointers.current.size === 0) {
        pinched.current = false;
        down.current = null;
        onManualZoom();
      }
      return;
    }
    down.current = null;
    const at = percentAt(e);
    if (!start || !at) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP) {
      // A drag: on a zoomed map that was a hand pan.
      if (viewer.isZoomed) onManualZoom();
      return;
    }
    // With a result selected, a click off its marker only lets go of it (markers keep their own clicks).
    if (selectedId !== null) {
      onClearSelection();
      return;
    }
    const hit = hitTestMap(data, map.id, at.x, at.y);
    if (hit.kind === HIT_KIND.goTo && hit.target) onOpen(hit.target.id);
    if (hit.kind === HIT_KIND.here) onPick(Number(formatCoord(at.x)), Number(formatCoord(at.y)));
  }

  function contextMenu(e: MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    onZoomOut();
  }

  function keyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Esc already used (leaving "choose on map").
    if (e.nativeEvent.defaultPrevented) return;
    // Arrows pan, +/- zoom: the player took the view.
    const viewKey = e.target === e.currentTarget && !e.ctrlKey && !e.metaKey && !e.altKey ? MAP_VIEW_KEYS.get(e.key) : undefined;
    if (viewKey) {
      e.preventDefault();
      if (viewKey.kind === "pan") viewer.panBy(viewKey.dx, viewKey.dy);
      else viewer.zoomBy(viewKey.steps);
      onManualZoom();
      return;
    }
    if (e.key !== "Escape") return;
    e.preventDefault();
    // Like the in-game map: Esc first lets go of the selection, then zooms out.
    if (selectedId !== null) onClearSelection();
    else onZoomOut();
  }

  function zoomStep(steps: number) {
    viewer.zoomBy(steps);
    onManualZoom();
  }

  const goTo = hover?.kind === HIT_KIND.goTo ? hover.target : null;
  let cursor: CSSProperties["cursor"];
  if (!viewer.dragging && goTo) cursor = "pointer";
  else if (!viewer.dragging && hover?.kind === HIT_KIND.here) cursor = "crosshair";
  const viewerStyle: CSSProperties = {
    cursor,
    // Unzoomed, a one-finger swipe still scrolls the page past the map; zoomed in, it pans the map.
    touchAction: viewer.isZoomed ? "none" : "pan-y",
    background: "transparent",
    font: "inherit",
  };

  const picture = (
    <>
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
          route={props.route}
          onSelectMarker={props.onSelectMarker}
          onOpenCluster={props.onOpenCluster}
          scale={viewer.scale}
        />
      </svg>
    </>
  );

  return (
    <div ref={canvasRef} className="space-y-2">
      <MapEdgeFrame labels={edgeLabels} onOpen={onOpen}>
        <div className="relative w-full rounded-xl bg-muted/40" style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}>
          <div
            ref={containerRef}
            data-testid="zone-map"
            tabIndex={0}
            aria-label={`${map.name} — scroll, pinch or +/- to zoom, drag or arrow keys to move; right-click or press Escape to zoom out`}
            className={VIEWER_CLASS}
            style={viewerStyle}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerCancel}
            onPointerLeave={() => setHover(null)}
            onContextMenu={contextMenu}
            onKeyDown={keyDown}
          >
            {createPortal(picture, viewer.picture)}
          </div>
          <MapZoomControls
            enabled={ready}
            isZoomed={viewer.isZoomed}
            canZoomIn={viewer.canZoomIn}
            onZoomIn={() => zoomStep(1)}
            onZoomOut={() => zoomStep(-1)}
            onReset={() => {
              reset();
              onManualZoom();
            }}
          />
        </div>
      </MapEdgeFrame>
      <MapHoverStatus map={map} hover={hover} faction={faction} />
      {imageFailed && <p className="text-xs text-muted-foreground">The map picture didn't load — showing a grid instead.</p>}
      {viewer.status === MAP_VIEWER_STATUS.failed && (
        <p className="text-xs text-muted-foreground">
          Zooming didn't load.{" "}
          <button type="button" onClick={viewer.retry} className="underline min-h-[44px]">
            Try again
          </button>
        </p>
      )}
    </div>
  );
}
