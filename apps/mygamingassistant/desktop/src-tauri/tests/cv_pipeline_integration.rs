//! End-to-end test for the CV pipeline using a FakeCapturer and a stub
//! event emitter. Exercises the full path:
//!
//!   1. Construct a CvPipeline with a fixture frame.
//!   2. Set the active calibration package (a 100x100 minimap with two
//!      zones: left + right).
//!   3. Tick the pipeline (twice — hysteresis requires 2 consecutive
//!      detections before emitting).
//!   4. Assert the stub emitter received exactly one `cv:zone-detected`
//!      event for the expected zone.
//!
//! Also covers the bundled de_mirage calibration: it MUST parse cleanly and
//! contain at least 10 zones (per the PR brief).

use std::sync::Arc;

use mygamingassistant_lib::capture::{fake::FakeCapturer, CaptureRegion, CapturedFrame};
use mygamingassistant_lib::cv::calibration::{
    bundled::load_bundled_calibration, AffineTransform, DotDetectionParams, MapCalibrationPackage,
    MinimapCalibration, ZonePolygon,
};
use mygamingassistant_lib::cv::pipeline::{CvEventEmitter, CvPipeline, StubCvEmitter, TickResult};
use mygamingassistant_lib::cv::state::CvPipelineState;

/// Build a 100x100 RGBA frame with a 6x6 yellow square at (dot_x, dot_y).
fn yellow_dot_frame(dot_x: u32, dot_y: u32) -> CapturedFrame {
    use image::Rgba as ImgRgba;
    let width = 100u32;
    let height = 100u32;
    let mut img = image::RgbaImage::new(width, height);
    for y in 0..height {
        for x in 0..width {
            img.put_pixel(x, y, ImgRgba([80, 80, 80, 255]));
        }
    }
    for y in dot_y..(dot_y + 6) {
        for x in dot_x..(dot_x + 6) {
            if x < width && y < height {
                img.put_pixel(x, y, ImgRgba([255, 255, 0, 255]));
            }
        }
    }
    let pixels = img.as_raw().clone();
    CapturedFrame::from_rgba(width, height, pixels).expect("valid")
}

fn left_right_package() -> MapCalibrationPackage {
    MapCalibrationPackage {
        map_slug: "fixture".into(),
        calibration: MinimapCalibration {
            schema_version: 1,
            resolution: "100x100".into(),
            minimap_region: CaptureRegion::new(0, 0, 100, 100).into(),
            world_transform: AffineTransform::from_minimap_size(100, 100),
            dot_detection: DotDetectionParams {
                target_rgb: [255, 255, 0],
                color_tolerance: 30,
                min_area_px: 4,
                max_area_px: 100,
            },
        },
        zones: vec![
            ZonePolygon {
                slug: "left".into(),
                name: "Left".into(),
                points: vec![(0.0, 0.0), (0.5, 0.0), (0.5, 1.0), (0.0, 1.0)],
            },
            ZonePolygon {
                slug: "right".into(),
                name: "Right".into(),
                points: vec![(0.5, 0.0), (1.0, 0.0), (1.0, 1.0), (0.5, 1.0)],
            },
        ],
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn pipeline_emits_zone_detected_after_hysteresis() {
    let frame = yellow_dot_frame(10, 50);
    let capturer = Arc::new(FakeCapturer::from_frame(frame));
    let emitter = Arc::new(StubCvEmitter::default());
    let pipeline = CvPipeline::new(capturer, emitter.clone(), CvPipelineState::new(true));

    pipeline.set_active(Some(left_right_package())).await;

    // First tick: hysteresis says "wait"
    let r1 = pipeline.tick().await;
    matches!(r1, TickResult::NoChange);
    assert_eq!(emitter.emits.lock().unwrap().len(), 0);

    // Second tick: hysteresis cleared, event emitted
    let r2 = pipeline.tick().await;
    matches!(r2, TickResult::Detected(_));
    let emits = emitter.emits.lock().unwrap();
    assert_eq!(emits.len(), 1);
    assert_eq!(emits[0].zone_slug.as_deref(), Some("left"));
    assert_eq!(emits[0].map_slug, "fixture");
    assert!(emits[0].confidence > 0.5);
    assert!(emits[0].latency_ms < 100.0); // Sanity bound; real numbers will be ~1ms
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn pipeline_pauses_when_no_calibration_active() {
    let frame = yellow_dot_frame(50, 50);
    let capturer = Arc::new(FakeCapturer::from_frame(frame));
    let emitter = Arc::new(StubCvEmitter::default());
    let pipeline = CvPipeline::new(capturer, emitter.clone(), CvPipelineState::new(true));

    // Don't call set_active.
    let r = pipeline.tick().await;
    matches!(r, TickResult::Paused);
    assert!(emitter.emits.lock().unwrap().is_empty());
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn pipeline_zone_change_emits_two_events() {
    let frame_left = yellow_dot_frame(10, 50);
    let frame_right = yellow_dot_frame(80, 50);
    let capturer = Arc::new(FakeCapturer::from_frame(frame_left));
    let emitter = Arc::new(StubCvEmitter::default());
    let pipeline = CvPipeline::new(
        capturer.clone(),
        emitter.clone(),
        CvPipelineState::new(true),
    );

    pipeline.set_active(Some(left_right_package())).await;

    // Establish "left"
    pipeline.tick().await;
    pipeline.tick().await; // emit #1 = left

    // Player walks right
    capturer.set_frame(frame_right);
    pipeline.tick().await; // streak=1, no emit
    pipeline.tick().await; // emit #2 = right

    let emits = emitter.emits.lock().unwrap();
    assert_eq!(emits.len(), 2);
    assert_eq!(emits[0].zone_slug.as_deref(), Some("left"));
    assert_eq!(emits[1].zone_slug.as_deref(), Some("right"));
}

#[test]
fn bundled_de_mirage_calibration_loads_and_has_expected_zones() {
    let pkg = load_bundled_calibration("mirage", "1920x1080").expect("bundled exists");
    assert_eq!(pkg.map_slug, "mirage");
    assert!(
        pkg.zones.len() >= 10,
        "expected >=10 zones, got {}",
        pkg.zones.len()
    );
    // Spot-check the required zones from the PR brief.
    let slugs: Vec<&str> = pkg.zones.iter().map(|z| z.slug.as_str()).collect();
    for required in &["a-site", "b-site", "mid", "t-spawn", "ct-spawn"] {
        assert!(
            slugs.contains(required),
            "missing required zone {required} in bundled mirage"
        );
    }
    // Calibration shape sanity
    assert_eq!(pkg.calibration.resolution, "1920x1080");
    assert_eq!(pkg.calibration.schema_version, 1);
    assert!(pkg.calibration.minimap_region.width > 0);
    assert!(pkg.calibration.minimap_region.height > 0);
}

#[test]
fn de_mirage_normalized_slug_resolves_to_bundled() {
    // GSI normalizes "de_mirage" → "mirage" before emitting, but the
    // bundled loader tolerates either spelling for forward-compat.
    assert!(load_bundled_calibration("de_mirage", "1920x1080").is_some());
}

/// Performance test — verify one tick completes well under the 16 ms budget.
///
/// Marked `#[ignore]` so it doesn't run on CI by default (CI runners are too
/// variable for hard timing assertions). Run locally with:
///
///   cd apps/mygamingassistant/desktop/src-tauri
///   cargo test --test cv_pipeline_integration tick_latency_under_budget -- --ignored --nocapture
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore]
async fn tick_latency_under_budget() {
    // 1920x1080 — full-screen frame size at the target resolution.
    use image::Rgba as ImgRgba;
    let width = 1920u32;
    let height = 1080u32;
    let mut img = image::RgbaImage::new(width, height);
    for y in 0..height {
        for x in 0..width {
            img.put_pixel(x, y, ImgRgba([80, 80, 80, 255]));
        }
    }
    // Plant a 6x6 yellow square at (50, 50) inside the minimap region.
    for y in 50..56 {
        for x in 50..56 {
            img.put_pixel(x, y, ImgRgba([255, 255, 0, 255]));
        }
    }
    let pixels = img.as_raw().clone();
    let frame = CapturedFrame::from_rgba(width, height, pixels).expect("valid");

    let capturer = Arc::new(FakeCapturer::from_frame(frame));
    let emitter: Arc<dyn CvEventEmitter> = Arc::new(StubCvEmitter::default());
    let pipeline = CvPipeline::new(capturer, emitter, CvPipelineState::new(true));

    // Mirror a realistic calibration: 280x280 minimap region at (16, 16).
    let pkg = MapCalibrationPackage {
        map_slug: "fixture".into(),
        calibration: MinimapCalibration {
            schema_version: 1,
            resolution: "1920x1080".into(),
            minimap_region: CaptureRegion::new(16, 16, 280, 280).into(),
            world_transform: AffineTransform::from_minimap_size(280, 280),
            dot_detection: DotDetectionParams {
                target_rgb: [255, 255, 0],
                color_tolerance: 30,
                min_area_px: 6,
                max_area_px: 80,
            },
        },
        zones: vec![ZonePolygon {
            slug: "test".into(),
            name: "Test".into(),
            points: vec![(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)],
        }],
    };
    pipeline.set_active(Some(pkg)).await;

    // Warm up — first tick allocates a bunch of imageproc internals.
    pipeline.tick().await;
    pipeline.tick().await;

    // Measure 10 ticks
    let mut max_ms: f32 = 0.0;
    let mut total_ms: f32 = 0.0;
    for _ in 0..10 {
        let start = std::time::Instant::now();
        let _ = pipeline.tick().await;
        let ms = start.elapsed().as_secs_f32() * 1000.0;
        max_ms = max_ms.max(ms);
        total_ms += ms;
    }
    let avg_ms = total_ms / 10.0;
    eprintln!("CV pipeline tick latency: avg={avg_ms:.2} ms, max={max_ms:.2} ms");

    // 16 ms is the 60 Hz tick budget. Even though we tick at 20 Hz, we
    // want headroom for capture + CV combined.
    assert!(
        max_ms < 16.0,
        "tick latency exceeded 16 ms budget: max={max_ms:.2} ms (avg={avg_ms:.2} ms)"
    );
}
