import type { Map as LeafletMap, Point } from "leaflet";
import { MAP_WHEEL_DEBOUNCE_MS } from "@/games/wow-forever/data/worldMap/mapViewer";
import type { Leaflet } from "@/games/wow-forever/types/leaflet";
import type { ZoomQueue } from "@/games/wow-forever/types/zoomQueue";
import { wheelZoomDelta } from "@/games/wow-forever/worldMap/mapViewport";

/**
 * Wheel zoom towards the pointer, as Leaflet's own does (a short burst of wheel
 * events becomes one smooth, animated zoom) — but owned here, so taking the map
 * down also cancels a zoom still waiting to happen (Leaflet's would fire on the
 * removed map), and a spin during a zoom carries on from it (`queue`).
 * `onZoom` runs when a wheel actually changed the zoom.
 * Returns a function that takes it off.
 */
export function attachWheelZoom(
  L: Leaflet,
  map: LeafletMap,
  container: HTMLElement,
  queue: ZoomQueue,
  pxPerLevel: number,
  onZoom: () => void,
): () => void {
  let pending = 0;
  let at: Point | null = null;
  let startedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function zoom() {
    timer = undefined;
    const from = queue.target();
    const target = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), from + wheelZoomDelta(pending, pxPerLevel)));
    pending = 0;
    startedAt = 0;
    if (!at || Math.abs(target - from) < 1e-6) return;
    map.stop();
    queue.zoomTo(target, at);
    onZoom();
  }

  function wheel(e: WheelEvent) {
    // Our map, not the page: never scroll it while zooming.
    e.preventDefault();
    pending += L.DomEvent.getWheelDelta(e);
    at = map.mouseEventToContainerPoint(e);
    const now = Date.now();
    if (!startedAt) startedAt = now;
    clearTimeout(timer);
    timer = setTimeout(zoom, Math.max(MAP_WHEEL_DEBOUNCE_MS - (now - startedAt), 0));
  }

  container.addEventListener("wheel", wheel, { passive: false });
  return () => {
    container.removeEventListener("wheel", wheel);
    clearTimeout(timer);
  };
}
