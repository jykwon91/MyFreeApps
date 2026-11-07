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
