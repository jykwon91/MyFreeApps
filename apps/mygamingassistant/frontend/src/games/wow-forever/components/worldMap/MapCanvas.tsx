import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import MapEdgeFrame from "@/games/wow-forever/components/worldMap/MapEdgeFrame";
import MapGrid from "@/games/wow-forever/components/worldMap/MapGrid";
import MapGround from "@/games/wow-forever/components/worldMap/MapGround";
import MapStyleToggle from "@/games/wow-forever/components/worldMap/MapStyleToggle";
import MapHoverHighlight from "@/games/wow-forever/components/worldMap/MapHoverHighlight";
import ZoneFitTints from "@/games/wow-forever/components/worldMap/ZoneFitTints";
import ZoneLevelLabels from "@/games/wow-forever/components/worldMap/ZoneLevelLabels";
import { useElementSize } from "@/games/wow-forever/hooks/useElementSize";
import { zoneFitsOf } from "@/games/wow-forever/worldMap/zoneFit";
import { placeZoneLabels, zoneLabels } from "@/games/wow-forever/worldMap/zoneLabels";
import LongPressRing from "@/games/wow-forever/components/worldMap/LongPressRing";
import MapHoverStatus from "@/games/wow-forever/components/worldMap/MapHoverStatus";
import MapMarksLayer from "@/games/wow-forever/components/worldMap/MapMarksLayer";
import MapMarkerLayer from "@/games/wow-forever/components/worldMap/MapMarkerLayer";
import MapZoomControls from "@/games/wow-forever/components/worldMap/MapZoomControls";
import { MAP_H, MAP_W } from "@/games/wow-forever/data/worldMap/mapViewer";
import { MAP_VIEW_KEYS } from "@/games/wow-forever/data/worldMap/mapViewKeys";
import { MAP_VIEWER_STATUS } from "@/games/wow-forever/data/worldMap/mapViewer";
import { MAP_STYLE } from "@/games/wow-forever/data/worldMap/mapStyle";
import { useMapPressMenu } from "@/games/wow-forever/hooks/useMapPressMenu";
import { useMapViewer } from "@/games/wow-forever/hooks/useMapViewer";
import { useSatelliteView } from "@/games/wow-forever/hooks/useSatelliteView";
import type { MapMarks } from "@/games/wow-forever/types/mapMarks/mapMarks";
import type { MapMenuTarget } from "@/games/wow-forever/types/mapMarks/mapMenuTarget";
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
 * element, and a changing className would make React wipe them. It is the
 * `group/viewer` whose `data-map-style` darkens the halos of labels and
 * lines on the satellite view.
 */
const VIEWER_CLASS =
  "group/viewer absolute inset-0 rounded-xl border select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500";

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
  /** Tint a continent's zones by how they fit this level ("Where to level"); null = no tint. */
  zoneFitLevel: number | null;
  /** Your marks + route on this map, and a shared set shown read-only (null = none). */
  marks: MapMarks;
  sharedMarks: MapMarks | null;
  /** Right-click, a long press or the menu key: the map menu at that point. */
  onMenu: (target: MapMenuTarget) => void;
  /** "Place a mark": the next click or tap on the map puts a mark there (Esc cancels). */
  placing: boolean;
  onPlace: (x: number, y: number) => void;
  onCancelPlace: () => void;
  /** Controls drawn over the map's corner (the Layers button and panel), outside the viewer so its keys stay its own. */
  overlay?: ReactNode;
}

/** The fit symbol in front of a label's level line takes two characters. */
const FIT_SYMBOL_CHARS = 2;

function sameHit(a: MapHit | null, b: MapHit): boolean {
  return !!a && a.kind === b.kind && a.target?.id === b.target?.id;
}

/**
 * One map of the zoom-out tree with its art, the route and the results, in a
 * Leaflet viewer: wheel / pinch / +/- to zoom, drag or arrow keys to pan.
 * Like the in-game map: hover a zone to light it up, click to open it,
 * Esc to zoom out (Esc, or a click, first clears a selected result — and the view goes back to where it
 * was before the selection, unless the player moved it since); on a zone map the neighbours are named at
 * the edges and a click past a border opens that zone. Right-click, a long press or the menu key opens
 * the map menu (add a mark, copy coordinates, zoom out) — `useMapPressMenu`.
 */
export default function MapCanvas(props: MapCanvasProps) {
  const { data, map, faction, focus, onFocusApplied, restore, onRestoreApplied, onManualZoom } = props;
  const { onOpen, onZoomOut, onPick, selectedId, onClearSelection, placing, onPlace, onCancelPlace } = props;
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewer = useMapViewer(containerRef, { onChange: props.onZoomChange, onWheelZoom: onManualZoom });
  const press = useMapPressMenu(containerRef, svgRef, props.onMenu);
  const { focusOn, reset, setView } = viewer;
  const ready = viewer.status === MAP_VIEWER_STATUS.ready;
  const settled = ready || viewer.status === MAP_VIEWER_STATUS.failed;
  const [imageFailed, setImageFailed] = useState(false);
  const satellite = useSatelliteView(map.id);
  const [hover, setHover] = useState<MapHit | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  // Fingers on the map: two or more is a pinch, never a click.
  const pointers = useRef(new Set<number>());
  const pinched = useRef(false);
  const revealed = useRef<MapFocus | null>(null);
  const edgeLabels = useMemo(() => neighbourLabels(data, map.id), [data, map.id]);
  // Zone labels on a continent: as many as fit at the picture's on-screen size (zooming in makes room for more).
  const boxSize = useElementSize(containerRef);
  const { zoneFitLevel } = props;
  const fits = useMemo(() => (zoneFitLevel === null ? null : zoneFitsOf(data, map, zoneFitLevel)), [data, map, zoneFitLevel]);
  const pictureWidth = (boxSize?.width ?? 0) * viewer.scale;
  const pictureHeight = (boxSize?.height ?? 0) * viewer.scale;
  const shownLabels = useMemo(
    () => placeZoneLabels(zoneLabels(data, map), pictureWidth, pictureHeight, fits ? FIT_SYMBOL_CHARS : 0),
    [data, map, pictureWidth, pictureHeight, fits],
  );

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
    press.down(e, pointers.current.size);
    if (pointers.current.size > 1) {
      pinched.current = true;
      return;
    }
    pinched.current = false;
    down.current = { x: e.clientX, y: e.clientY };
  }

  function pointerMove(e: PointerEvent<HTMLDivElement>) {
    press.move(e);
    if (viewer.dragging || pointers.current.size > 1) return;
    const at = percentAt(e);
    if (!at) return;
    const hit = hitTestMap(data, map.id, at.x, at.y);
    if (!sameHit(hover, hit)) setHover(hit);
  }

  function pointerCancel(e: PointerEvent<HTMLDivElement>) {
    // The page took the gesture (a swipe scrolling past the map): no click.
    press.end(e);
    pointers.current.delete(e.pointerId);
    down.current = null;
  }

  function pointerUp(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (press.end(e)) {
      // The finger held long enough to open the menu: that was no click.
      down.current = null;
      return;
    }
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
    if (placing) {
      onPlace(at.x, at.y);
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
    if (e.target === e.currentTarget && (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey))) {
      e.preventDefault();
      press.keyMenu();
      return;
    }
    if (e.key !== "Escape") return;
    e.preventDefault();
    // Like the in-game map: Esc first stops placing a mark, then lets go of the selection, then zooms out.
    if (placing) onCancelPlace();
    else if (selectedId !== null) onClearSelection();
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
  if (!viewer.dragging && placing) cursor = "crosshair";
  const viewerStyle: CSSProperties = {
    cursor,
    // Unzoomed, a one-finger swipe still scrolls the page past the map; zoomed in, it pans the map.
    touchAction: viewer.isZoomed ? "none" : "pan-y",
    background: "transparent",
    font: "inherit",
    // iOS: a held finger opens our menu, not the system's image callout.
    WebkitTouchCallout: "none",
  };

  const picture = (
    <>
      <MapGround
        mapId={map.id}
        mapName={map.name}
        drawnFailed={imageFailed}
        onDrawnError={() => setImageFailed(true)}
        satelliteSrc={satellite.src}
        satelliteShown={satellite.shown}
        onSatelliteLoad={satellite.onLoad}
        onSatelliteError={satellite.onError}
      />
      {fits && <ZoneFitTints data={data} map={map} fits={fits} />}
      {goTo && <MapHoverHighlight map={map} target={goTo} faction={faction} />}
      {boxSize && shownLabels.length > 0 && <ZoneLevelLabels labels={shownLabels} fits={fits} />}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="absolute inset-0 h-full w-full"
        role="group"
        aria-label={`${map.name} markers`}
      >
        {imageFailed && !satellite.shown && <MapGrid width={MAP_W} height={MAP_H} />}
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
        {props.sharedMarks && <MapMarksLayer marks={props.sharedMarks} shared scale={viewer.scale} />}
        <MapMarksLayer marks={props.marks} scale={viewer.scale} />
      </svg>
    </>
  );

  return (
    <div ref={canvasRef} data-map-frame className="space-y-2">
      <MapEdgeFrame labels={edgeLabels} onOpen={onOpen}>
        <div className="relative w-full rounded-xl bg-muted/40" style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}>
          <div
            ref={containerRef}
            data-testid="zone-map"
            data-map-viewer
            data-map-style={satellite.shown ? MAP_STYLE.satellite : MAP_STYLE.drawn}
            tabIndex={0}
            aria-label={`${map.name} — scroll, pinch or +/- to zoom, drag or arrow keys to move; Escape to zoom out; right-click, long-press or Shift+F10 for the map menu`}
            className={VIEWER_CLASS}
            style={viewerStyle}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerCancel}
            onPointerLeave={() => setHover(null)}
            onContextMenu={press.contextMenu}
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
          {satellite.available && (
            <MapStyleToggle value={satellite.value} busy={satellite.busy} onChange={satellite.choose} onPreload={satellite.preload} />
          )}
          {press.ring && <LongPressRing ring={press.ring} />}
          {props.overlay}
        </div>
      </MapEdgeFrame>
      <MapHoverStatus map={map} hover={hover} faction={faction} />
      {imageFailed && !satellite.shown && <p className="text-xs text-muted-foreground">The map picture didn't load — showing a grid instead.</p>}
      {satellite.failed && (
        <p role="status" className="text-xs text-muted-foreground">
          The satellite view didn't load, so this is the drawn map.{" "}
          <button type="button" onClick={() => satellite.choose(MAP_STYLE.satellite)} className="underline min-h-[44px]">
            Try again
          </button>
        </p>
      )}
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
