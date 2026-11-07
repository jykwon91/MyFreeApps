import { MAP_H, MAP_W } from "@/games/wow-forever/data/worldMap/mapViewer";
import type { MapViewport } from "@/games/wow-forever/types/mapViewport";

/** The whole picture, centred. */
export const FULL_VIEW: MapViewport = { scale: 1, centerX: 0.5, centerY: 0.5 };

/**
 * The map picture in the viewer's flat coordinates (Leaflet `CRS.Simple`, [lat, lng]):
 * one unit is one art pixel at zoom 0, the top-left corner is (0, 0) and "down" is
 * negative lat. So a zone's 0–100 map coordinates land straight on its art.
 */
export const PICTURE_BOUNDS: [[number, number], [number, number]] = [
  [-MAP_H, 0],
  [0, MAP_W],
];

/** The zoom at which the whole picture just fits a viewer of this size (0 before it has a size). */
export function fitZoom(width: number, height: number): number {
  if (!(width > 0 && height > 0)) return 0;
  return Math.log2(Math.min(width / MAP_W, height / MAP_H));
}

/** The viewer zoom that shows the picture `scale` times its fitted size. */
export function zoomForScale(fit: number, scale: number): number {
  return fit + Math.log2(scale);
}

/** How many times its fitted size the picture is drawn at `zoom`. */
export function scaleAtZoom(fit: number, zoom: number): number {
  return 2 ** (zoom - fit);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Zoom between 1 and `maxScale`, centred so the picture still covers the viewer (no empty gutters). */
export function clampViewport(view: MapViewport, maxScale: number): MapViewport {
  const scale = clamp(Number.isFinite(view.scale) ? view.scale : 1, 1, maxScale);
  const half = 0.5 / scale;
  return {
    scale,
    centerX: clamp(view.centerX, half, 1 - half),
    centerY: clamp(view.centerY, half, 1 - half),
  };
}

/** A point given as 0..1 across / down the picture, in viewer [lat, lng]. */
export function pictureLatLng(x: number, y: number): [number, number] {
  return [-y * MAP_H, x * MAP_W];
}

/** The view shown by a viewer centred on [lat, lng] at `zoom`. */
export function viewportAt(lat: number, lng: number, zoom: number, fit: number): MapViewport {
  return { scale: scaleAtZoom(fit, zoom), centerX: lng / MAP_W, centerY: -lat / MAP_H };
}

/**
 * The view moved by (dx, dy) screen pixels at viewer `zoom` (one picture pixel
 * is 2^zoom screen pixels), kept on the picture. + dx shows more to the right.
 */
export function panViewport(view: MapViewport, dx: number, dy: number, zoom: number, maxScale: number): MapViewport {
  const px = 2 ** zoom;
  return clampViewport(
    { ...view, centerX: view.centerX + dx / (MAP_W * px), centerY: view.centerY + dy / (MAP_H * px) },
    maxScale,
  );
}

/**
 * Zoom levels for a burst of wheel movement (`wheelPx`, + = towards you = zoom in):
 * Leaflet's easing curve — a small nudge zooms a little, a hard spin tops out at 4 levels.
 */
export function wheelZoomDelta(wheelPx: number, pxPerLevel: number): number {
  const eased = wheelPx / (pxPerLevel * 4);
  const levels = (4 * Math.log(2 / (1 + Math.exp(-Math.abs(eased))))) / Math.LN2;
  return Math.sign(wheelPx) * levels;
}

/** Zoomed in past the whole-picture view (allowing for float noise). */
export function isZoomedIn(view: MapViewport): boolean {
  return view.scale > 1.001;
}
