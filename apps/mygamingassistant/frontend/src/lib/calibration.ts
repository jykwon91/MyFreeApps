/**
 * Calibration types + serde helpers — PR 9b.
 *
 * Mirror of the Rust shapes in `src-tauri/src/cv/calibration.rs`. Kept in
 * sync by hand because the surface is tiny and stable; if it grows much
 * larger we should generate via `ts-rs` or `specta` instead.
 */
import type {
  CvMapCalibrationPackage,
  CvMinimapCalibration,
  CvZonePolygon,
  CvCaptureRegion,
  CvDotDetectionParams,
  CvWorldTransform,
} from "@/types/desktop";

/**
 * Edits that the calibration UI's draft reducer surfaces. Each section's
 * "dirty" flag is computed by comparing the draft against the loaded baseline.
 */
export interface CalibrationDirty {
  region: boolean;
  zones: boolean;
  dots: boolean;
}

/**
 * Compute which sections have unsaved edits.
 *
 * Pure function — easy to unit test. Reference equality short-circuits when
 * the operator hasn't touched anything; deep structural compare only fires
 * on real edits.
 */
export function computeDirtySections(
  loaded: CvMapCalibrationPackage | null,
  draftCalibration: CvMinimapCalibration | null,
  draftZones: CvZonePolygon[] | null,
): CalibrationDirty {
  if (!loaded || !draftCalibration || !draftZones) {
    return {
      region: !!draftCalibration && !loaded,
      zones: (draftZones?.length ?? 0) > 0 && !loaded,
      dots: !!draftCalibration && !loaded,
    };
  }
  return {
    region: !captureRegionsEqual(
      loaded.calibration.minimap_region,
      draftCalibration.minimap_region,
    ),
    zones: !zoneListsEqual(loaded.zones, draftZones),
    dots: !dotParamsEqual(
      loaded.calibration.dot_detection,
      draftCalibration.dot_detection,
    ),
  };
}

export function captureRegionsEqual(
  a: CvCaptureRegion,
  b: CvCaptureRegion,
): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

export function dotParamsEqual(
  a: CvDotDetectionParams,
  b: CvDotDetectionParams,
): boolean {
  return (
    a.target_rgb[0] === b.target_rgb[0] &&
    a.target_rgb[1] === b.target_rgb[1] &&
    a.target_rgb[2] === b.target_rgb[2] &&
    a.color_tolerance === b.color_tolerance &&
    a.min_area_px === b.min_area_px &&
    a.max_area_px === b.max_area_px
  );
}

export function worldTransformsEqual(
  a: CvWorldTransform,
  b: CvWorldTransform,
): boolean {
  return (
    a.scale_x === b.scale_x &&
    a.scale_y === b.scale_y &&
    a.offset_x === b.offset_x &&
    a.offset_y === b.offset_y
  );
}

export function zoneListsEqual(
  a: CvZonePolygon[],
  b: CvZonePolygon[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const za = a[i];
    const zb = b[i];
    if (za.slug !== zb.slug) return false;
    if (za.name !== zb.name) return false;
    if (za.points.length !== zb.points.length) return false;
    for (let p = 0; p < za.points.length; p += 1) {
      if (
        za.points[p][0] !== zb.points[p][0] ||
        za.points[p][1] !== zb.points[p][1]
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Detect whether a single zone in the draft list differs from the loaded
 * baseline of the same slug. Used by `ZoneList` to render per-row dirty pips.
 */
export function isZoneEdited(
  draftZone: CvZonePolygon,
  loaded: CvZonePolygon[],
): boolean {
  const baseline = loaded.find((z) => z.slug === draftZone.slug);
  if (!baseline) {
    return true; // New zone (not in baseline) is edited
  }
  if (baseline.name !== draftZone.name) return true;
  if (baseline.points.length !== draftZone.points.length) return true;
  for (let p = 0; p < baseline.points.length; p += 1) {
    if (
      baseline.points[p][0] !== draftZone.points[p][0] ||
      baseline.points[p][1] !== draftZone.points[p][1]
    ) {
      return true;
    }
  }
  return false;
}

/** Default identity world transform — used when seeding a new calibration. */
export function identityWorldTransform(): CvWorldTransform {
  return { scale_x: 1.0, scale_y: 1.0, offset_x: 0.0, offset_y: 0.0 };
}

/**
 * Build a fresh world transform from a minimap region — maps (0,0)–(w,h)
 * onto (0,0)–(1,1) world space. Same shape as `AffineTransform::from_minimap_size`
 * in Rust.
 */
export function worldTransformFromRegion(
  region: CvCaptureRegion,
): CvWorldTransform {
  const w = Math.max(region.width, 1);
  const h = Math.max(region.height, 1);
  return { scale_x: 1.0 / w, scale_y: 1.0 / h, offset_x: 0.0, offset_y: 0.0 };
}

/**
 * Compute an axis-aligned bounding rect from four corner points. Used by
 * `RegionCornerPicker` once all 4 corners are placed.
 *
 * Returns null if any coord is non-finite (the picker keeps the rect empty
 * until the operator confirms valid clicks).
 */
export function regionFromCorners(
  corners: Array<{ x: number; y: number }>,
): CvCaptureRegion | null {
  if (corners.length < 4) return null;
  if (!corners.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y))) {
    return null;
  }
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(0, Math.round(maxX - minX));
  const height = Math.max(0, Math.round(maxY - minY));
  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width,
    height,
  };
}

/**
 * Point-in-polygon (ray-casting). Mirrors the Rust impl in
 * `src-tauri/src/cv/polygon.rs::point_in_polygon` so the synthetic dot
 * preview in `ZoneSyntheticDotPreview` matches what the pipeline would do.
 *
 * Boundary semantics: points exactly on an edge are INSIDE (same as Rust).
 */
export function pointInPolygon(
  px: number,
  py: number,
  points: Array<[number, number]>,
): boolean {
  const n = points.length;
  if (n < 3) return false;

  // Boundary check first — unambiguous regardless of ray-cast parity.
  for (let i = 0; i < n; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % n];
    if (pointOnSegment(px, py, ax, ay, bx, by)) return true;
  }

  let inside = false;
  let j = n - 1;
  for (let i = 0; i < n; i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const crosses = yi > py !== yj > py;
    if (crosses) {
      const xIntersect = xi + ((py - yi) * (xj - xi)) / (yj - yi);
      if (px < xIntersect) inside = !inside;
    }
    j = i;
  }
  return inside;
}

function pointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const EPS = 1e-5;
  const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  if (Math.abs(cross) > EPS) return false;
  const minX = Math.min(ax, bx);
  const maxX = Math.max(ax, bx);
  const minY = Math.min(ay, by);
  const maxY = Math.max(ay, by);
  return (
    px >= minX - EPS && px <= maxX + EPS && py >= minY - EPS && py <= maxY + EPS
  );
}

/**
 * Find the slug of the first polygon containing `(world_x, world_y)`. Mirrors
 * `polygon::find_zone` on the Rust side.
 */
export function findZone(
  worldX: number,
  worldY: number,
  zones: CvZonePolygon[],
): string | null {
  for (const z of zones) {
    if (pointInPolygon(worldX, worldY, z.points)) {
      return z.slug;
    }
  }
  return null;
}

/**
 * Convert an `[r, g, b]` triple to a `#rrggbb` hex string. Used by the dot
 * color swatch + sliders.
 */
export function rgbToHex(rgb: [number, number, number]): string {
  return (
    "#" +
    rgb
      .map((c) => {
        const v = Math.max(0, Math.min(255, Math.round(c)));
        return v.toString(16).padStart(2, "0");
      })
      .join("")
  );
}

/**
 * Parse a `#rrggbb` (or `#rgb`) string. Returns null on malformed input so
 * the UI can keep the prior value instead of clearing.
 */
export function hexToRgb(hex: string): [number, number, number] | null {
  const trimmed = hex.trim().replace(/^#/, "");
  if (trimmed.length === 3) {
    const r = parseInt(trimmed[0] + trimmed[0], 16);
    const g = parseInt(trimmed[1] + trimmed[1], 16);
    const b = parseInt(trimmed[2] + trimmed[2], 16);
    if ([r, g, b].some((c) => Number.isNaN(c))) return null;
    return [r, g, b];
  }
  if (trimmed.length === 6) {
    const r = parseInt(trimmed.slice(0, 2), 16);
    const g = parseInt(trimmed.slice(2, 4), 16);
    const b = parseInt(trimmed.slice(4, 6), 16);
    if ([r, g, b].some((c) => Number.isNaN(c))) return null;
    return [r, g, b];
  }
  return null;
}

/**
 * Suggested tolerance from a picked-color sample. 1.5× the max single-channel
 * deviation between the sampled pixels, clamped to [10, 60]. Mirrors the
 * design spec exactly.
 */
export function suggestColorTolerance(
  samples: Array<[number, number, number]>,
  target: [number, number, number],
): number {
  if (samples.length === 0) return 24;
  let maxDev = 0;
  for (const sample of samples) {
    for (let i = 0; i < 3; i += 1) {
      const dev = Math.abs(sample[i] - target[i]);
      if (dev > maxDev) maxDev = dev;
    }
  }
  const suggested = Math.round(maxDev * 1.5);
  return Math.max(10, Math.min(60, suggested));
}

/**
 * Default starter calibration for a new (map, resolution) pair. Used when
 * the operator picks a fresh combo with no bundled default.
 */
export function emptyCalibrationPackage(
  mapSlug: string,
  resolution: string,
): CvMapCalibrationPackage {
  return {
    map_slug: mapSlug,
    calibration: {
      schema_version: 1,
      resolution,
      minimap_region: { x: 0, y: 0, width: 240, height: 240 },
      world_transform: identityWorldTransform(),
      dot_detection: {
        target_rgb: [255, 255, 0],
        color_tolerance: 30,
        min_area_px: 6,
        max_area_px: 80,
      },
    },
    zones: [],
  };
}
