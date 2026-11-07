import type { MapViewport } from "@/games/wow-forever/types/mapViewport";

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
