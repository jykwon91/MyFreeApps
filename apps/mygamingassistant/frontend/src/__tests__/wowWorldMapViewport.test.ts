import { describe, expect, it } from "vitest";
import { CRS, latLng, latLngBounds } from "leaflet";
import { MAP_H, MAP_W, MAX_MAP_SCALE } from "@/games/wow-forever/data/worldMap/mapViewer";
import {
  FULL_VIEW,
  PICTURE_BOUNDS,
  clampViewport,
  fitZoom,
  isZoomedIn,
  panViewport,
  pictureLatLng,
  scaleAtZoom,
  viewportAt,
  wheelZoomDelta,
  zoomForScale,
} from "@/games/wow-forever/worldMap/mapViewport";

/** Where a picture point is drawn, in art pixels, by Leaflet's own flat projection at zoom 0. */
function artPixel(x: number, y: number) {
  const [lat, lng] = pictureLatLng(x, y);
  return CRS.Simple.latLngToPoint(latLng(lat, lng), 0);
}

describe("World Map viewer coordinates", () => {
  it("a zone's 0–100 map coordinates land on the same pixel of its 1002×668 art", () => {
    // Goldshire's inn on Elwynn Forest: 42.0, 65.0.
    const at = artPixel(0.42, 0.65);
    expect(at.x).toBeCloseTo(0.42 * MAP_W, 6);
    expect(at.y).toBeCloseTo(0.65 * MAP_H, 6);
    for (const [x, y] of [
      [0, 0],
      [1, 1],
      [0.5, 0.5],
      [0.123, 0.987],
    ]) {
      const p = artPixel(x, y);
      expect(p.x).toBeCloseTo(x * MAP_W, 6);
      expect(p.y).toBeCloseTo(y * MAP_H, 6);
    }
  });

  it("the picture's bounds are exactly the art, top-left at (0, 0)", () => {
    const bounds = latLngBounds(PICTURE_BOUNDS);
    const topLeft = CRS.Simple.latLngToPoint(bounds.getNorthWest(), 0);
    const bottomRight = CRS.Simple.latLngToPoint(bounds.getSouthEast(), 0);
    expect([topLeft.x, topLeft.y]).toEqual([0, 0]);
    expect([bottomRight.x, bottomRight.y]).toEqual([MAP_W, MAP_H]);
  });

  it("fits the whole picture to the viewer, whichever side is tighter", () => {
    expect(scaleAtZoom(0, fitZoom(MAP_W, MAP_H))).toBeCloseTo(1, 9);
    // 343 px wide (a phone), proportional: the width decides.
    expect(2 ** fitZoom(343, (343 * MAP_H) / MAP_W)).toBeCloseTo(343 / MAP_W, 9);
    // Short and wide: the height decides.
    expect(2 ** fitZoom(2000, 334)).toBeCloseTo(334 / MAP_H, 9);
    // Not laid out yet (no size): a finite zoom, never -Infinity.
    expect(fitZoom(0, 0)).toBe(0);
  });

  it("scale and zoom convert both ways around the fitted zoom", () => {
    const fit = fitZoom(600, 400);
    expect(scaleAtZoom(fit, zoomForScale(fit, 2.5))).toBeCloseTo(2.5, 9);
    expect(zoomForScale(fit, 1)).toBe(fit);
  });

  it("a view read back from the viewer's centre and zoom is the view that was set", () => {
    const fit = fitZoom(900, 600);
    const [lat, lng] = pictureLatLng(0.3, 0.7);
    const view = viewportAt(lat, lng, zoomForScale(fit, 3), fit);
    expect(view.scale).toBeCloseTo(3, 9);
    expect(view.centerX).toBeCloseTo(0.3, 9);
    expect(view.centerY).toBeCloseTo(0.7, 9);
  });

  it("keeps the zoom between the whole picture and the deepest zoom, never showing past the art", () => {
    expect(clampViewport({ scale: 0.5, centerX: 0.1, centerY: 0.9 }, MAX_MAP_SCALE)).toEqual(FULL_VIEW);
    expect(clampViewport({ scale: 10, centerX: 0.5, centerY: 0.5 }, MAX_MAP_SCALE).scale).toBe(MAX_MAP_SCALE);
    // Zoomed 2x, a corner point is pulled in so the picture still covers the viewer.
    expect(clampViewport({ scale: 2, centerX: 0, centerY: 1 }, MAX_MAP_SCALE)).toEqual({ scale: 2, centerX: 0.25, centerY: 0.75 });
    expect(clampViewport({ scale: Number.NaN, centerX: 0.5, centerY: 0.5 }, MAX_MAP_SCALE)).toEqual(FULL_VIEW);
  });

  it("pans by screen pixels at the current zoom, and stops at the art's edge", () => {
    // At zoom 1 one picture pixel is 2 screen pixels: 200 px right = 100 art px = 100 / 1002 of the width.
    const view = { scale: 2, centerX: 0.5, centerY: 0.5 };
    const moved = panViewport(view, 200, -100, 1, MAX_MAP_SCALE);
    expect(moved.centerX).toBeCloseTo(0.5 + 100 / MAP_W, 9);
    expect(moved.centerY).toBeCloseTo(0.5 - 50 / MAP_H, 9);
    expect(moved.scale).toBe(2);
    expect(panViewport(view, 100_000, 100_000, 1, MAX_MAP_SCALE)).toEqual({ scale: 2, centerX: 0.75, centerY: 0.75 });
    // The whole picture can't move at all.
    expect(panViewport(FULL_VIEW, 300, 300, 0, MAX_MAP_SCALE)).toEqual(FULL_VIEW);
  });

  it("knows when it's zoomed in, ignoring float noise", () => {
    expect(isZoomedIn(FULL_VIEW)).toBe(false);
    expect(isZoomedIn({ ...FULL_VIEW, scale: 1.0000001 })).toBe(false);
    expect(isZoomedIn({ ...FULL_VIEW, scale: 1.2 })).toBe(true);
  });

  it("eases wheel movement into zoom levels: towards you zooms in, capped at 4 levels", () => {
    expect(wheelZoomDelta(120, 120)).toBeGreaterThan(0);
    expect(wheelZoomDelta(-120, 120)).toBeCloseTo(-wheelZoomDelta(120, 120), 9);
    expect(wheelZoomDelta(0, 120)).toBe(0);
    expect(wheelZoomDelta(100_000, 120)).toBeCloseTo(4, 3);
    expect(Math.abs(wheelZoomDelta(30, 120))).toBeLessThan(Math.abs(wheelZoomDelta(300, 120)));
  });
});
