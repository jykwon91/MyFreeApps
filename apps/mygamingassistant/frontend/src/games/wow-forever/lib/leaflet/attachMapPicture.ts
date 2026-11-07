import type { LatLngBounds, Map as LeafletMap, ZoomAnimEvent } from "leaflet";
import type { Leaflet } from "@/games/wow-forever/lib/leaflet/loadLeaflet";

/**
 * Puts our own map picture (art, highlight and markers, rendered by React) on a
 * Leaflet map, stretched over `bounds` — the job Leaflet's image overlay does
 * for a bare <img>: re-sized after every zoom, scaled with the zoom animation
 * in between, and carried along by pans with the map pane.
 * Returns a function that takes it back off.
 */
export function attachMapPicture(L: Leaflet, map: LeafletMap, picture: HTMLElement, bounds: LatLngBounds): () => void {
  const pane = map.getPane("overlayPane");
  const mapPane = map.getPane("mapPane");
  if (!pane || !mapPane) throw new Error("Leaflet map has no overlay pane");
  pane.appendChild(picture);
  picture.classList.add("leaflet-zoom-animated");

  function place() {
    const topLeft = map.latLngToLayerPoint(bounds.getNorthWest());
    const bottomRight = map.latLngToLayerPoint(bounds.getSouthEast());
    L.DomUtil.setPosition(picture, topLeft);
    picture.style.width = `${bottomRight.x - topLeft.x}px`;
    picture.style.height = `${bottomRight.y - topLeft.y}px`;
  }

  // Where the picture's corner will be once the animated zoom lands (as Leaflet's own overlays work it out).
  function animate(e: ZoomAnimEvent) {
    const origin = map
      .project(e.center, e.zoom)
      .subtract(map.getSize().divideBy(2))
      .add(L.DomUtil.getPosition(mapPane!))
      .round();
    const offset = map.project(bounds.getNorthWest(), e.zoom).subtract(origin);
    L.DomUtil.setTransform(picture, offset, map.getZoomScale(e.zoom));
  }

  map.on("zoom viewreset", place);
  map.on("zoomanim", animate);
  place();

  return () => {
    map.off("zoom viewreset", place);
    map.off("zoomanim", animate);
    picture.classList.remove("leaflet-zoom-animated");
    picture.style.removeProperty("width");
    picture.style.removeProperty("height");
    picture.style.removeProperty("transform");
  };
}
