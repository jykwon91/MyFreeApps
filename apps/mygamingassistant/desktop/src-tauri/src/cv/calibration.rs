//! Minimap calibration types + affine transform from minimap-pixel space to
//! "world" space (the same coordinate space `MapZone.polygon_points` lives in
//! on the backend).
//!
//! Why "world space":
//!   - Backend stores zone polygons as normalized 0-1 coords (relative to the
//!     map image). Frontend uses them as SVG polygons over the same image.
//!   - The CV pipeline detects player position in MINIMAP-pixel space. To
//!     decide which zone the player is in, we need to transform minimap
//!     coords into the same 0-1 normalized space as the polygons.
//!   - That common space is what we call "world space". Affine for PR 9a;
//!     PR 9b may add rotation if any map needs it.

use serde::{Deserialize, Serialize};

use crate::capture::CaptureRegion;

/// Per-map calibration data. Persisted as JSON, mirroring the backend's
/// `Map.minimap_calibration_json` field shape (with PR-9a-specific
/// extensions for dot-detection params).
///
/// Versioned via `schema_version` so PR 9b's calibration UI can introduce a
/// new shape without breaking old bundled JSON.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MinimapCalibration {
    /// Schema version for forward compatibility. Always `1` for PR 9a.
    pub schema_version: u32,
    /// Which screen resolution this calibration was authored for. Operator
    /// picks the matching calibration when launching the pipeline; PR 9b
    /// adds a resolution picker.
    pub resolution: String,
    /// Where on the captured screen the minimap actually lives.
    pub minimap_region: CaptureRegionPersisted,
    /// Affine transform parameters: minimap-pixel → world (0-1) space.
    pub world_transform: AffineTransform,
    /// Player-dot detection parameters.
    pub dot_detection: DotDetectionParams,
}

/// Persisted copy of `CaptureRegion` with serde derives so it survives JSON
/// round-trip. (We don't derive on the runtime type so the runtime can stay
/// a `Copy` struct without serde leaking in.)
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaptureRegionPersisted {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

impl From<CaptureRegionPersisted> for CaptureRegion {
    fn from(p: CaptureRegionPersisted) -> Self {
        CaptureRegion::new(p.x, p.y, p.width, p.height)
    }
}

impl From<CaptureRegion> for CaptureRegionPersisted {
    fn from(r: CaptureRegion) -> Self {
        Self {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
        }
    }
}

/// 2D scale + translate. The simplest transform that handles a non-uniform
/// minimap (different aspect ratio than world space). PR 9b may extend this
/// to a full 2x3 matrix if any map needs rotation.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct AffineTransform {
    pub scale_x: f32,
    pub scale_y: f32,
    pub offset_x: f32,
    pub offset_y: f32,
}

impl AffineTransform {
    /// Identity — maps every coord to itself. Useful for tests + as a default
    /// when no calibration exists.
    pub fn identity() -> Self {
        Self {
            scale_x: 1.0,
            scale_y: 1.0,
            offset_x: 0.0,
            offset_y: 0.0,
        }
    }

    /// Apply the transform to a single (x, y) point.
    pub fn apply(&self, x: f32, y: f32) -> (f32, f32) {
        (x * self.scale_x + self.offset_x, y * self.scale_y + self.offset_y)
    }

    /// Convenience: build the transform that maps the (0,0)-(width,height)
    /// minimap rect onto the (0,0)-(1,1) world rect. This is the calibration
    /// shape for the "no rotation, minimap fills its captured region"
    /// happy path.
    pub fn from_minimap_size(width: u32, height: u32) -> Self {
        let w = (width as f32).max(1.0);
        let h = (height as f32).max(1.0);
        Self {
            scale_x: 1.0 / w,
            scale_y: 1.0 / h,
            offset_x: 0.0,
            offset_y: 0.0,
        }
    }
}

/// Dot-detection parameters. These are per-map because:
///   - CS2 uses a slightly different player-dot palette per minimap variant.
///   - Some operators run colorblind modes that change the local-player tint.
///
/// PR 9a ships sane defaults for the bundled de_mirage calibration;
/// PR 9b's UI will let the operator tune these.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct DotDetectionParams {
    /// Target RGB triple for the local player's dot. Pixels within
    /// `color_tolerance` Euclidean distance are considered candidates.
    pub target_rgb: [u8; 3],
    /// Maximum Euclidean RGB distance from `target_rgb` to count as a match.
    /// 0 = exact match only. ~30 is a sane starting point.
    pub color_tolerance: u8,
    /// Connected-component pixel-area filter: only components with
    /// `min_area_px <= area <= max_area_px` are considered.
    pub min_area_px: u32,
    pub max_area_px: u32,
}

/// One zone on a map, in world (0-1 normalized) space.
///
/// Polygons stored in the backend `MapZone.polygon_points` JSON have shape
/// `[{"x": float, "y": float}, ...]`. We deserialize that shape into
/// `Vec<(f32, f32)>` for fast point-in-polygon tests.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ZonePolygon {
    pub slug: String,
    pub name: String,
    /// Vertices in CCW or CW order — point-in-polygon doesn't care.
    /// Tuples for compactness + fast access.
    pub points: Vec<(f32, f32)>,
}

/// Whole-map calibration package — calibration + the zones to test against.
///
/// One of these is loaded at the start of a tracking session and kept hot
/// in memory for the duration. Reloading happens only on map change.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MapCalibrationPackage {
    pub map_slug: String,
    pub calibration: MinimapCalibration,
    pub zones: Vec<ZonePolygon>,
}

// -----------------------------------------------------------------------------
// Bundled defaults
// -----------------------------------------------------------------------------

/// Bundled-default calibrations baked into the binary. Used as a fallback
/// when no operator-edited calibration exists on disk yet.
///
/// PR 9a ships one calibration: `de_mirage` @ 1920x1080. PR 9b will add a UI
/// for operators to edit and save more.
pub mod bundled {
    use super::MapCalibrationPackage;

    /// `de_mirage` @ 1920x1080 default calibration baked into the binary.
    /// The JSON file lives at `desktop/src-tauri/calibrations/de_mirage_1920x1080.json`
    /// and is included via `include_str!` so it ships in every build.
    pub const DE_MIRAGE_1920X1080_JSON: &str = include_str!(
        "../../calibrations/de_mirage_1920x1080.json"
    );

    /// Load the bundled calibration for the given map slug + resolution.
    /// Returns `None` if no bundled match exists (operator must use the
    /// calibration UI from PR 9b, or PR 9a's CV stays disabled for that map).
    pub fn load_bundled_calibration(
        map_slug: &str,
        resolution: &str,
    ) -> Option<MapCalibrationPackage> {
        match (map_slug, resolution) {
            ("mirage", "1920x1080") | ("de_mirage", "1920x1080") => {
                Some(parse_or_panic(DE_MIRAGE_1920X1080_JSON))
            }
            _ => None,
        }
    }

    /// Parse a bundled calibration JSON. Panics on parse failure — bundled
    /// JSON is committed source, so a failure here is a compile-time bug.
    /// We panic loudly with the parse error so the failure is obvious in
    /// `cargo test`.
    fn parse_or_panic(json: &str) -> MapCalibrationPackage {
        serde_json::from_str(json).unwrap_or_else(|e| {
            panic!("bundled calibration JSON failed to parse: {e}\n--- JSON ---\n{json}")
        })
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        /// The bundled default MUST parse cleanly. If this test fails, the
        /// JSON file was edited into an invalid shape — fix the JSON, not
        /// the test.
        #[test]
        fn bundled_de_mirage_calibration_parses() {
            let pkg = load_bundled_calibration("mirage", "1920x1080").expect("bundled mirage");
            assert_eq!(pkg.map_slug, "mirage");
            assert_eq!(pkg.calibration.schema_version, 1);
            assert_eq!(pkg.calibration.resolution, "1920x1080");
            // At least 10 zones in the bundled package (per the PR brief).
            assert!(
                pkg.zones.len() >= 10,
                "expected >=10 zones, got {}",
                pkg.zones.len()
            );
            // A subset of expected zones must be present.
            let slugs: Vec<&str> = pkg.zones.iter().map(|z| z.slug.as_str()).collect();
            for required in &["a-site", "b-site", "mid"] {
                assert!(
                    slugs.contains(required),
                    "missing required zone {required} in bundled mirage"
                );
            }
        }

        #[test]
        fn load_bundled_calibration_returns_none_for_unknown() {
            assert!(load_bundled_calibration("unknown", "1920x1080").is_none());
            assert!(load_bundled_calibration("mirage", "800x600").is_none());
        }

        #[test]
        fn de_prefix_slug_also_resolves() {
            // GSI may post de_mirage; pipeline normalizes to mirage but the
            // bundled lookup tolerates either spelling.
            assert!(load_bundled_calibration("de_mirage", "1920x1080").is_some());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn affine_identity_preserves_coords() {
        let t = AffineTransform::identity();
        assert_eq!(t.apply(0.5, 0.7), (0.5, 0.7));
        assert_eq!(t.apply(0.0, 0.0), (0.0, 0.0));
        assert_eq!(t.apply(1.0, 1.0), (1.0, 1.0));
    }

    #[test]
    fn affine_from_minimap_size_normalizes_to_unit_square() {
        let t = AffineTransform::from_minimap_size(200, 100);
        // (0,0) → (0,0)
        let (x, y) = t.apply(0.0, 0.0);
        assert!((x - 0.0).abs() < 1e-6);
        assert!((y - 0.0).abs() < 1e-6);
        // (200, 100) → (1, 1)
        let (x, y) = t.apply(200.0, 100.0);
        assert!((x - 1.0).abs() < 1e-6);
        assert!((y - 1.0).abs() < 1e-6);
        // (100, 50) → (0.5, 0.5)
        let (x, y) = t.apply(100.0, 50.0);
        assert!((x - 0.5).abs() < 1e-6);
        assert!((y - 0.5).abs() < 1e-6);
    }

    #[test]
    fn affine_handles_scale_and_offset_together() {
        let t = AffineTransform {
            scale_x: 0.5,
            scale_y: 2.0,
            offset_x: 1.0,
            offset_y: -1.0,
        };
        // x=10 -> 10*0.5 + 1 = 6
        // y=5  ->  5*2.0 - 1 = 9
        let (x, y) = t.apply(10.0, 5.0);
        assert!((x - 6.0).abs() < 1e-6);
        assert!((y - 9.0).abs() < 1e-6);
    }

    #[test]
    fn capture_region_round_trips_through_persistence() {
        let original = CaptureRegion::new(100, 200, 300, 400);
        let persisted: CaptureRegionPersisted = original.into();
        let recovered: CaptureRegion = persisted.into();
        assert_eq!(original, recovered);
    }

    #[test]
    fn minimap_calibration_serde_round_trip() {
        let cal = MinimapCalibration {
            schema_version: 1,
            resolution: "1920x1080".into(),
            minimap_region: CaptureRegion::new(1660, 30, 240, 240).into(),
            world_transform: AffineTransform::from_minimap_size(240, 240),
            dot_detection: DotDetectionParams {
                target_rgb: [255, 255, 0],
                color_tolerance: 30,
                min_area_px: 4,
                max_area_px: 80,
            },
        };
        let json = serde_json::to_string(&cal).expect("serializes");
        let back: MinimapCalibration = serde_json::from_str(&json).expect("deserializes");
        assert_eq!(cal, back);
    }
}
