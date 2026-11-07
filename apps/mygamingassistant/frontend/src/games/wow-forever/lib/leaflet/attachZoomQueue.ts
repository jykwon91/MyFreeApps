import type { Map as LeafletMap, ZoomAnimEvent } from "leaflet";
import type { ZoomQueue } from "@/games/wow-forever/types/zoomQueue";

/**
 * Leaflet ignores a zoom or view asked for while a zoom is still on its way (it
 * starts animating a frame later, then runs to the end), so quick taps on +, a
 * held key, a second wheel spin or "put the view back" right after "show on
 * map" would be lost. This keeps the newest such request and runs it when the
 * zoom under way ends, and counts zoom steps from where the map is heading.
 */
export function attachZoomQueue(map: LeafletMap): ZoomQueue {
  /** The zoom under way (ours, or any other animated one — a pinch); null when still. */
  let heading: number | null = null;
  let pending: { zoom: number; run: () => void } | null = null;

  function clampZoom(zoom: number): number {
    return Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), zoom));
  }

  /** Before calling Leaflet: a zoom that doesn't animate ends (zoomend) inside the call. */
  function startsZoom(zoom: number): boolean {
    const changes = Math.abs(zoom - map.getZoom()) > 1e-6;
    if (changes) heading = zoom;
    return changes;
  }

  function request(zoom: number, run: () => void) {
    if (heading !== null) pending = { zoom, run };
    else run();
  }

  function onAnimate(e: ZoomAnimEvent) {
    heading = e.zoom;
  }

  function onZoomEnd() {
    heading = null;
    const next = pending;
    pending = null;
    next?.run();
  }

  map.on("zoomanim", onAnimate);
  map.on("zoomend", onZoomEnd);

  return {
    target: () => pending?.zoom ?? heading ?? map.getZoom(),
    busy: () => heading !== null || pending !== null,
    zoomTo(zoom, around) {
      const next = clampZoom(zoom);
      request(next, () => {
        if (!startsZoom(next)) return;
        if (around) map.setZoomAround(around, next);
        else map.setZoom(next);
      });
    },
    viewTo(center, zoom) {
      const next = clampZoom(zoom);
      request(next, () => {
        startsZoom(next);
        map.setView(center, next);
      });
    },
    detach() {
      map.off("zoomanim", onAnimate);
      map.off("zoomend", onZoomEnd);
      pending = null;
      heading = null;
    },
  };
}
