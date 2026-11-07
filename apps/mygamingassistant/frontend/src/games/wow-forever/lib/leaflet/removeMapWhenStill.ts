import type { Map as LeafletMap } from "leaflet";

/**
 * Takes a Leaflet map down — once a zoom under way has landed, when `zooming`.
 * Leaflet's `remove()` doesn't cancel the timer that ends a zoom animation, so
 * removing mid-zoom lets that timer run on the removed map and throw. Waiting
 * for its `zoomend` (or `waitMs`, should it never come) avoids that.
 */
export function removeMapWhenStill(map: LeafletMap, zooming: boolean, waitMs: number): void {
  if (!zooming) {
    map.remove();
    return;
  }
  let done = false;
  function remove() {
    if (done) return;
    done = true;
    clearTimeout(fallback);
    map.off("zoomend", onZoomEnd);
    map.remove();
  }
  // After the zoomend handlers: Leaflet fires moveend straight after on the same map.
  function onZoomEnd() {
    setTimeout(remove, 0);
  }
  const fallback = setTimeout(remove, waitMs);
  map.on("zoomend", onZoomEnd);
}
