/**
 * Coordinate format adapters between the polygon editor canvas and the
 * MapZoneOverlay consumer.
 *
 * The shipped `ZoneEditorCanvas` (from the CV-calibration page) stores
 * vertices as `Array<[number, number]>` tuples; `MapZoneOverlay` reads
 * `Array<{x, y}>` objects from the backend's `MapZone.polygon_points`
 * column. Without this serializer the two would silently disagree —
 * tuples passed to MapZoneOverlay's `pointsToSvg` (which does `p.x *
 * size`) would render as NaN at the origin.
 *
 * All coords are normalized 0-1. The clamp helper is included for
 * defensive use at boundaries — the editor canvas already clamps
 * locally on every pointer event, but a malformed external value
 * (stale localStorage draft, hand-edited fixture) should not break
 * downstream rendering.
 */

export type PointTuple = [number, number];
export type PointObject = { x: number; y: number };

export function tupleToObject(p: PointTuple): PointObject {
  return { x: p[0], y: p[1] };
}

export function objectToTuple(p: PointObject): PointTuple {
  return [p.x, p.y];
}

export function tuplesToObjects(points: PointTuple[]): PointObject[] {
  return points.map(tupleToObject);
}

export function objectsToTuples(points: PointObject[]): PointTuple[] {
  return points.map(objectToTuple);
}

export function clampPoint(p: PointObject): PointObject {
  return { x: clamp01(p.x), y: clamp01(p.y) };
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
