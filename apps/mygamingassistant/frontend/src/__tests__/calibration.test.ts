/**
 * Unit tests for `lib/calibration.ts` — pure helpers that are the foundation
 * of the calibration editor's correctness.
 */
import { describe, expect, it } from "vitest";
import {
  captureRegionsEqual,
  computeDirtySections,
  dotParamsEqual,
  findZone,
  hexToRgb,
  identityWorldTransform,
  isZoneEdited,
  pointInPolygon,
  regionFromCorners,
  rgbToHex,
  suggestColorTolerance,
  worldTransformFromRegion,
  worldTransformsEqual,
  zoneListsEqual,
} from "@/lib/calibration";
import type {
  CvCaptureRegion,
  CvDotDetectionParams,
  CvMapCalibrationPackage,
  CvZonePolygon,
} from "@/types/desktop";

describe("pointInPolygon", () => {
  const square: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];

  it("returns true inside the unit square", () => {
    expect(pointInPolygon(0.5, 0.5, square)).toBe(true);
    expect(pointInPolygon(0.1, 0.1, square)).toBe(true);
  });

  it("returns false outside the unit square", () => {
    expect(pointInPolygon(-0.1, 0.5, square)).toBe(false);
    expect(pointInPolygon(1.5, 0.5, square)).toBe(false);
    expect(pointInPolygon(0.5, 1.5, square)).toBe(false);
  });

  it("treats edge points as inside (matches Rust semantics)", () => {
    expect(pointInPolygon(0.5, 0, square)).toBe(true);
    expect(pointInPolygon(1, 0.5, square)).toBe(true);
  });

  it("returns false for degenerate polygons", () => {
    expect(pointInPolygon(0.5, 0.5, [])).toBe(false);
    expect(pointInPolygon(0.5, 0.5, [[0, 0]])).toBe(false);
    expect(pointInPolygon(0.5, 0.5, [[0, 0], [1, 1]])).toBe(false);
  });

  it("handles concave polygons (L-shape notch)", () => {
    const lShape: Array<[number, number]> = [
      [0, 0],
      [0.5, 0],
      [0.5, 0.5],
      [1, 0.5],
      [1, 1],
      [0, 1],
    ];
    expect(pointInPolygon(0.25, 0.25, lShape)).toBe(true);
    expect(pointInPolygon(0.75, 0.75, lShape)).toBe(true);
    // The notch
    expect(pointInPolygon(0.75, 0.25, lShape)).toBe(false);
  });
});

describe("findZone", () => {
  const zones: CvZonePolygon[] = [
    {
      slug: "a-site",
      name: "A Site",
      points: [
        [0, 0],
        [0.4, 0],
        [0.4, 0.4],
        [0, 0.4],
      ],
    },
    {
      slug: "b-site",
      name: "B Site",
      points: [
        [0.6, 0.6],
        [1, 0.6],
        [1, 1],
        [0.6, 1],
      ],
    },
  ];

  it("returns first containing zone", () => {
    expect(findZone(0.2, 0.2, zones)).toBe("a-site");
    expect(findZone(0.8, 0.8, zones)).toBe("b-site");
  });

  it("returns null for unzoned points", () => {
    expect(findZone(0.5, 0.5, zones)).toBeNull();
  });
});

describe("regionFromCorners", () => {
  it("returns null with fewer than 4 corners", () => {
    expect(regionFromCorners([])).toBeNull();
    expect(regionFromCorners([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull();
  });

  it("computes bounding rect from 4 corners", () => {
    const r = regionFromCorners([
      { x: 100, y: 50 },
      { x: 200, y: 60 },
      { x: 210, y: 150 },
      { x: 110, y: 140 },
    ]);
    expect(r).toEqual({ x: 100, y: 50, width: 110, height: 100 });
  });

  it("returns null for non-finite coords", () => {
    const r = regionFromCorners([
      { x: NaN, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 1 },
    ]);
    expect(r).toBeNull();
  });
});

describe("rgbToHex / hexToRgb", () => {
  it("round-trips RGB → hex → RGB", () => {
    const cases: Array<[number, number, number]> = [
      [255, 255, 0],
      [0, 0, 0],
      [128, 64, 200],
    ];
    for (const c of cases) {
      const hex = rgbToHex(c);
      const back = hexToRgb(hex);
      expect(back).toEqual(c);
    }
  });

  it("hexToRgb accepts 3-digit shorthand", () => {
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
    expect(hexToRgb("#000")).toEqual([0, 0, 0]);
  });

  it("hexToRgb returns null for malformed input", () => {
    expect(hexToRgb("nonsense")).toBeNull();
    expect(hexToRgb("#12345")).toBeNull();
    expect(hexToRgb("#zzzzzz")).toBeNull();
  });

  it("rgbToHex clamps out-of-range channels", () => {
    expect(rgbToHex([-10, 999, 128])).toBe("#00ff80");
  });
});

describe("suggestColorTolerance", () => {
  it("returns default 24 with empty samples", () => {
    expect(suggestColorTolerance([], [255, 255, 0])).toBe(24);
  });

  it("clamps low deviation to 10", () => {
    // All samples exactly match target → dev = 0 → 1.5×0 = 0 → clamp to 10
    expect(suggestColorTolerance([[255, 255, 0]], [255, 255, 0])).toBe(10);
  });

  it("clamps high deviation to 60", () => {
    // huge dev → 1.5 × dev > 60 → clamp
    expect(suggestColorTolerance([[0, 0, 0]], [255, 255, 255])).toBe(60);
  });

  it("interpolates linearly", () => {
    // dev = 20 → 1.5 × 20 = 30
    expect(suggestColorTolerance([[235, 235, 0]], [255, 255, 0])).toBe(30);
  });
});

describe("captureRegionsEqual", () => {
  it("identifies equal regions", () => {
    const a: CvCaptureRegion = { x: 1, y: 2, width: 3, height: 4 };
    expect(captureRegionsEqual(a, { ...a })).toBe(true);
  });

  it("identifies differing regions", () => {
    const a: CvCaptureRegion = { x: 1, y: 2, width: 3, height: 4 };
    expect(captureRegionsEqual(a, { ...a, x: 99 })).toBe(false);
  });
});

describe("dotParamsEqual", () => {
  const base: CvDotDetectionParams = {
    target_rgb: [255, 255, 0],
    color_tolerance: 30,
    min_area_px: 6,
    max_area_px: 80,
  };
  it("identifies equal params", () => {
    expect(dotParamsEqual(base, { ...base, target_rgb: [...base.target_rgb] as [number, number, number] })).toBe(true);
  });
  it("identifies differing rgb", () => {
    expect(dotParamsEqual(base, { ...base, target_rgb: [200, 255, 0] })).toBe(false);
  });
  it("identifies differing area", () => {
    expect(dotParamsEqual(base, { ...base, min_area_px: 7 })).toBe(false);
  });
});

describe("zoneListsEqual + isZoneEdited", () => {
  const a: CvZonePolygon = {
    slug: "a",
    name: "A",
    points: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  };
  const b: CvZonePolygon = { ...a, slug: "b", name: "B" };
  it("returns true for equal lists", () => {
    expect(zoneListsEqual([a, b], [a, b])).toBe(true);
  });
  it("returns false on different lengths", () => {
    expect(zoneListsEqual([a], [a, b])).toBe(false);
  });
  it("returns false on different points", () => {
    const altered = { ...a, points: [[0, 0], [1, 0], [1, 1], [0, 0.99]] as Array<[number, number]> };
    expect(zoneListsEqual([a], [altered])).toBe(false);
  });
  it("isZoneEdited returns true when zone slug not in baseline (new zone)", () => {
    expect(isZoneEdited({ ...a, slug: "new" }, [])).toBe(true);
  });
  it("isZoneEdited returns false when zone matches baseline exactly", () => {
    expect(isZoneEdited(a, [a])).toBe(false);
  });
  it("isZoneEdited returns true when name differs", () => {
    expect(isZoneEdited({ ...a, name: "Different" }, [a])).toBe(true);
  });
});

describe("worldTransform helpers", () => {
  it("identity is an identity transform", () => {
    const t = identityWorldTransform();
    expect(t.scale_x).toBe(1);
    expect(t.offset_x).toBe(0);
  });
  it("worldTransformFromRegion maps region size to [0,1]", () => {
    const t = worldTransformFromRegion({ x: 0, y: 0, width: 200, height: 100 });
    expect(t.scale_x).toBeCloseTo(1 / 200);
    expect(t.scale_y).toBeCloseTo(1 / 100);
    expect(t.offset_x).toBe(0);
  });
  it("worldTransformsEqual identifies equality", () => {
    const t1 = worldTransformFromRegion({ x: 0, y: 0, width: 100, height: 100 });
    const t2 = worldTransformFromRegion({ x: 0, y: 0, width: 100, height: 100 });
    expect(worldTransformsEqual(t1, t2)).toBe(true);
  });
});

describe("computeDirtySections", () => {
  const pkg: CvMapCalibrationPackage = {
    map_slug: "mirage",
    calibration: {
      schema_version: 1,
      resolution: "1920x1080",
      minimap_region: { x: 16, y: 16, width: 280, height: 280 },
      world_transform: identityWorldTransform(),
      dot_detection: {
        target_rgb: [255, 255, 0],
        color_tolerance: 30,
        min_area_px: 6,
        max_area_px: 80,
      },
    },
    zones: [
      {
        slug: "a",
        name: "A",
        points: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      },
    ],
  };

  it("flags all clean when draft matches loaded exactly", () => {
    const d = computeDirtySections(pkg, pkg.calibration, pkg.zones);
    expect(d).toEqual({ region: false, zones: false, dots: false });
  });

  it("flags region dirty on region change", () => {
    const altered = {
      ...pkg.calibration,
      minimap_region: { ...pkg.calibration.minimap_region, x: 99 },
    };
    const d = computeDirtySections(pkg, altered, pkg.zones);
    expect(d.region).toBe(true);
    expect(d.zones).toBe(false);
    expect(d.dots).toBe(false);
  });

  it("flags dots dirty on dot params change", () => {
    const altered = {
      ...pkg.calibration,
      dot_detection: { ...pkg.calibration.dot_detection, color_tolerance: 99 },
    };
    const d = computeDirtySections(pkg, altered, pkg.zones);
    expect(d.dots).toBe(true);
  });

  it("flags zones dirty when zones differ", () => {
    const altered = pkg.zones.map((z) => ({ ...z, name: "Renamed" }));
    const d = computeDirtySections(pkg, pkg.calibration, altered);
    expect(d.zones).toBe(true);
  });
});
