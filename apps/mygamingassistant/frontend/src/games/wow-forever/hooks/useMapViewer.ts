import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Map as LeafletMap } from "leaflet";
import { MAP_WHEEL_PX_PER_ZOOM, MAP_ZOOM_STEP, MAX_MAP_SCALE } from "@/games/wow-forever/data/worldMap/mapViewer";
import { attachMapPicture } from "@/games/wow-forever/lib/leaflet/attachMapPicture";
import { attachWheelZoom } from "@/games/wow-forever/lib/leaflet/attachWheelZoom";
import { attachZoomQueue, type ZoomQueue } from "@/games/wow-forever/lib/leaflet/attachZoomQueue";
import { loadLeaflet, loadedLeaflet, type Leaflet } from "@/games/wow-forever/lib/leaflet/loadLeaflet";
import type { MapViewport } from "@/games/wow-forever/types/mapViewport";
import {
  FULL_VIEW,
  PICTURE_BOUNDS,
  clampViewport,
  fitZoom,
  isZoomedIn,
  panViewport,
  scaleAtZoom,
  pictureLatLng,
  viewportAt,
  zoomForScale,
} from "@/games/wow-forever/worldMap/mapViewport";

export const MAP_VIEWER_STATUS = { loading: "loading", ready: "ready", failed: "failed" } as const;
export type MapViewerStatus = (typeof MAP_VIEWER_STATUS)[keyof typeof MAP_VIEWER_STATUS];

/** Before Leaflet takes it over, the picture simply fills the viewer. */
const PICTURE_CLASS = "absolute left-0 top-0 h-full w-full";

export interface MapViewerOptions {
  /**
   * Every settled view (after a zoom, a pan, a resize), programmatic or not. A
   * view asked for in code (setView / focusOn / reset) is reported when asked,
   * and the stops on the way to it are not, so the page always knows where
   * the map is going.
   */
  onChange?: (view: MapViewport) => void;
  /** The wheel changed the zoom (a person, never focusOn / setView / reset). */
  onWheelZoom?: () => void;
}

function readView(map: LeafletMap, fit: number): MapViewport {
  const centre = map.getCenter();
  return viewportAt(centre.lat, centre.lng, map.getZoom(), fit);
}

/**
 * A Leaflet map (`CRS.Simple`) over one map picture: wheel / pinch / +/- zoom,
 * drag and arrow-key pans (keys come from the page: `zoomBy` / `panBy`), never zoomed out past the whole picture nor panned
 * off it. The picture is an element React renders into (`picture`, via a
 * portal) — it fills the viewer straight away and moves onto the Leaflet map
 * once Leaflet has loaded, so the page never waits on the viewer to show the map.
 */
export function useMapViewer(containerRef: RefObject<HTMLDivElement | null>, options: MapViewerOptions = {}) {
  const [picture] = useState(() => {
    const el = document.createElement("div");
    el.className = PICTURE_CLASS;
    return el;
  });
  const [leaflet, setLeaflet] = useState<Leaflet | null>(loadedLeaflet);
  const [failed, setFailed] = useState(false);
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [view, setCurrentView] = useState<MapViewport>(FULL_VIEW);
  const [dragging, setDragging] = useState(false);
  const fit = useRef(0);
  const zoomQueue = useRef<ZoomQueue | null>(null);
  /** Where arrow-key pans are heading, until the view settles (so a held key adds up). */
  const panTarget = useRef<MapViewport | null>(null);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    if (leaflet || failed) return;
    let live = true;
    loadLeaflet().then(
      (module) => live && setLeaflet(() => module),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [leaflet, failed]);

  // The picture is on the page from the first paint, before (or without) Leaflet.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container && !picture.parentNode) container.appendChild(picture);
  }, [containerRef, picture]);

  useEffect(() => {
    const container = containerRef.current;
    if (!leaflet || !container) return;
    const L = leaflet;
    const bounds = L.latLngBounds(PICTURE_BOUNDS);
    const viewer = L.map(container, {
      crs: L.CRS.Simple,
      zoomSnap: 0,
      zoomDelta: MAP_ZOOM_STEP,
      // Our own keys (zoomBy / panBy): Leaflet's drop a zoom pressed mid-animation.
      keyboard: false,
      maxBounds: bounds,
      maxBoundsViscosity: 1,
      bounceAtZoomLimits: false,
      // A click on the map means "open this zone" / "I'm here", so a double click must not zoom.
      doubleClickZoom: false,
      boxZoom: false,
      // Our own (attachWheelZoom): Leaflet's would still fire after the map is taken down.
      scrollWheelZoom: false,
      zoomControl: false,
      attributionControl: false,
    });
    let size = { width: container.clientWidth, height: container.clientHeight };

    /** Fit the zoom range to the viewer's size and show `target` in it. */
    function show(target: MapViewport) {
      fit.current = fitZoom(size.width, size.height);
      const next = clampViewport(target, MAX_MAP_SCALE);
      viewer.setMinZoom(fit.current);
      viewer.setMaxZoom(zoomForScale(fit.current, MAX_MAP_SCALE));
      viewer.setView(pictureLatLng(next.centerX, next.centerY), zoomForScale(fit.current, next.scale), { animate: false });
    }
    show(FULL_VIEW);
    const detach = attachMapPicture(L, viewer, picture, bounds);
    const queue = attachZoomQueue(viewer);
    zoomQueue.current = queue;
    const detachWheel = attachWheelZoom(L, viewer, container, queue, MAP_WHEEL_PX_PER_ZOOM, () => optionsRef.current.onWheelZoom?.());

    // Mid-gesture (pinch, animated zoom): at most one re-render a frame, for the markers' size.
    let frame = 0;
    function moving() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setCurrentView(readView(viewer, fit.current));
      });
    }
    function settled() {
      panTarget.current = null;
      const next = readView(viewer, fit.current);
      setCurrentView(next);
      if (!queue.busy()) optionsRef.current.onChange?.(next);
    }
    viewer.on("zoom move", moving);
    viewer.on("moveend", settled);
    viewer.on("dragstart", () => setDragging(true));
    viewer.on("dragend", () => setDragging(false));

    // A resize keeps the same part of the picture in view.
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            const next = { width: container.clientWidth, height: container.clientHeight };
            if (next.width === size.width && next.height === size.height) return;
            const keep = readView(viewer, fit.current);
            size = next;
            viewer.invalidateSize({ pan: false });
            show(keep);
          });
    observer?.observe(container);
    viewer.whenReady(() => {
      setMap(viewer);
      settled();
    });

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      detachWheel();
      queue.detach();
      zoomQueue.current = null;
      detach();
      viewer.remove();
      container.appendChild(picture);
      setMap(null);
      setDragging(false);
    };
  }, [leaflet, containerRef, picture]);

  /** Show `target` (clamped to the picture), smoothly when the viewer can. */
  const showView = useCallback(
    (target: MapViewport) => {
      const queue = zoomQueue.current;
      if (!map || !queue) return;
      const next = clampViewport(target, MAX_MAP_SCALE);
      queue.viewTo(pictureLatLng(next.centerX, next.centerY), zoomForScale(fit.current, next.scale));
      optionsRef.current.onChange?.(next);
    },
    [map],
  );

  /** Zoom to `scale` with the picture point (x, y) — 0..1 of it — as near the middle as the edges allow. */
  const focusOn = useCallback((x: number, y: number, scale: number) => showView({ scale, centerX: x, centerY: y }), [showView]);

  const reset = useCallback(() => showView(FULL_VIEW), [showView]);

  /** +/- (buttons, keys): zoom steps in or out around the middle; quick presses add up. */
  const zoomBy = useCallback((steps: number) => {
    const queue = zoomQueue.current;
    queue?.zoomTo(queue.target() + steps * MAP_ZOOM_STEP);
  }, []);

  /** Arrow keys: move the view by screen pixels, never off the picture. */
  const panBy = useCallback(
    (dx: number, dy: number) => {
      const queue = zoomQueue.current;
      if (!map || !queue) return;
      // Mid-zoom, pan at the zoom it's heading to (so the pan doesn't undo it).
      const zoom = queue.target();
      const from = panTarget.current ?? { ...readView(map, fit.current), scale: scaleAtZoom(fit.current, zoom) };
      const next = panViewport(from, dx, dy, zoom, MAX_MAP_SCALE);
      showView(next);
      // After: showing it stops the pan under way, which "settles" the view.
      panTarget.current = next;
    },
    [map, showView],
  );

  const retry = useCallback(() => setFailed(false), []);

  let status: MapViewerStatus = MAP_VIEWER_STATUS.loading;
  if (failed) status = MAP_VIEWER_STATUS.failed;
  else if (map) status = MAP_VIEWER_STATUS.ready;

  return {
    /** Render the map picture into this element (a portal). */
    picture,
    status,
    retry,
    view,
    scale: view.scale,
    isZoomed: isZoomedIn(view),
    canZoomIn: view.scale < MAX_MAP_SCALE - 0.001,
    dragging,
    focusOn,
    setView: showView,
    reset,
    zoomBy,
    panBy,
  };
}
