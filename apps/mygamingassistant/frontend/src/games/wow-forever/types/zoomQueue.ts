import type { LatLngExpression, Point } from "leaflet";

export interface ZoomQueue {
  /** The zoom the map is at, or on its way to. */
  target: () => number;
  /** A zoom is under way or waiting: the view the map is at now is a stop on the way. */
  busy: () => boolean;
  /** Zoom to `zoom` (kept in the map's range), around a viewer point when given. */
  zoomTo: (zoom: number, around?: Point) => void;
  /** Show `center` at `zoom` (kept in range), smoothly. */
  viewTo: (center: LatLngExpression, zoom: number) => void;
  detach: () => void;
}
