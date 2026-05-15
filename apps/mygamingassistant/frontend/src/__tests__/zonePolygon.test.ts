/**
 * Tests for lib/zonePolygon.ts.
 *
 * The design review for the zone editor flagged a format mismatch
 * between the editor canvas (tuple form) and the MapZoneOverlay consumer
 * (object form) as a ship-blocker. These tests pin the conversion both
 * ways so a future refactor can't silently re-introduce the bug.
 */
import { describe, expect, it } from "vitest";
import {
  tupleToObject,
  objectToTuple,
  tuplesToObjects,
  objectsToTuples,
  clampPoint,
} from "@/lib/zonePolygon";

describe("zonePolygon adapters", () => {
  it("tupleToObject maps [x, y] to {x, y}", () => {
    expect(tupleToObject([0.25, 0.75])).toEqual({ x: 0.25, y: 0.75 });
  });

  it("objectToTuple maps {x, y} to [x, y]", () => {
    expect(objectToTuple({ x: 0.25, y: 0.75 })).toEqual([0.25, 0.75]);
  });

  it("round-trips through both directions without drift", () => {
    const original: Array<[number, number]> = [
      [0.1, 0.2],
      [0.3, 0.4],
      [0.5, 0.6],
    ];
    const out = objectsToTuples(tuplesToObjects(original));
    expect(out).toEqual(original);
  });

  it("round-trips object→tuple→object preserving values", () => {
    const original = [
      { x: 0.7, y: 0.3 },
      { x: 0.9, y: 0.3 },
      { x: 0.9, y: 0.5 },
      { x: 0.7, y: 0.5 },
    ];
    const out = tuplesToObjects(objectsToTuples(original));
    expect(out).toEqual(original);
  });

  it("handles empty arrays in both directions", () => {
    expect(tuplesToObjects([])).toEqual([]);
    expect(objectsToTuples([])).toEqual([]);
  });
});

describe("clampPoint", () => {
  it("passes through in-range values", () => {
    expect(clampPoint({ x: 0.5, y: 0.5 })).toEqual({ x: 0.5, y: 0.5 });
  });

  it("clamps negatives to 0", () => {
    expect(clampPoint({ x: -0.3, y: -0.1 })).toEqual({ x: 0, y: 0 });
  });

  it("clamps >1 down to 1", () => {
    expect(clampPoint({ x: 1.5, y: 2.0 })).toEqual({ x: 1, y: 1 });
  });

  it("coerces NaN to 0", () => {
    expect(clampPoint({ x: Number.NaN, y: 0.5 })).toEqual({ x: 0, y: 0.5 });
  });

  it("preserves boundary values exactly", () => {
    expect(clampPoint({ x: 0, y: 1 })).toEqual({ x: 0, y: 1 });
  });
});
