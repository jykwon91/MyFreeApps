/** The client's world-map canvas size — the art in /public/wow-maps is drawn at this size. */
export const MAP_W = 1002;
export const MAP_H = 668;

/**
 * Deepest zoom, as a multiple of the whole-map view. The art is the client's
 * 1002×668 at most, so past this it only blurs; markers carry the detail.
 */
export const MAX_MAP_SCALE = 4;

/** One +/- press (button or key): half a zoom level, about 1.4×. */
export const MAP_ZOOM_STEP = 0.5;

/** Wheel distance (px) per zoom level — slower than Leaflet's 60 so a trackpad doesn't race. */
export const MAP_WHEEL_PX_PER_ZOOM = 120;

/** How far one arrow-key press pans the map, in screen px. */
export const MAP_KEYBOARD_PAN_PX = 80;

/** Wheel events closer together than this are one zoom (a trackpad sends dozens a second). */
export const MAP_WHEEL_DEBOUNCE_MS = 40;

/**
 * Longest a map waits for a zoom under way to land before it's taken down
 * (Leaflet's own transition ends after 250 ms; this is the fallback).
 */
export const MAP_TEARDOWN_WAIT_MS = 500;

/** Before Leaflet takes it over, the map picture simply fills the viewer. */
export const MAP_PICTURE_CLASS = "absolute left-0 top-0 h-full w-full";

/** Below Tailwind's `sm`: the Layers panel is a bottom sheet instead of a card over the map. */
export const MOBILE_SHEET_QUERY = "(max-width: 639px)";

/** Where the viewer is: Leaflet still loading, ready, or failed to load. */
export const MAP_VIEWER_STATUS = { loading: "loading", ready: "ready", failed: "failed" } as const;
