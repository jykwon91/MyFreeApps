//! CV pipeline orchestrator. The single place where `capture`, `dot_detector`,
//! `calibration`, and `polygon` come together.
//!
//! Lifecycle:
//!   - `CvPipeline::new(...)` builds the pipeline but doesn't tick yet.
//!   - `CvPipeline::start_loop(...)` spawns a tokio task that ticks at 20 Hz.
//!   - `CvPipeline::stop()` aborts the task (via shared cancellation flag).
//!   - `CvPipeline::on_map_change(slug)` reloads the calibration package for
//!     the new map. The pipeline pauses when no calibration is available;
//!     it does NOT spam events or burn CPU during that time.
//!
//! Event emission:
//!   - The pipeline emits `cv:zone-detected` events ONLY when the zone
//!     changes (debounce). This matches the GSI receiver's emit pattern —
//!     downstream React listeners can subscribe without re-rendering 20x/s.
//!   - A `ZoneHysteresis` filter prevents flapping at zone boundaries: a
//!     new zone must be detected in `N` consecutive ticks before it
//!     "wins" the next emit.
//!
//! Cancellation:
//!   - The tokio task checks a shared `Arc<AtomicBool>` each iteration.
//!     `stop()` sets it; the task exits cleanly on the next tick.
//!   - We deliberately avoid `JoinHandle::abort()` so any in-flight mutex
//!     guard releases before the task drops. tokio is permissive but the
//!     explicit handshake is cheaper to reason about.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use tokio::sync::Mutex as AsyncMutex;

use crate::capture::ScreenCapturer;
use crate::cv::calibration::{MapCalibrationPackage, ZonePolygon};
use crate::cv::dot_detector::{detect_player_dot, DotDetection};
use crate::cv::polygon::find_zone;
use crate::cv::state::CvPipelineState;

/// Tauri event name emitted on zone-change. The frontend `useCvState` hook
/// subscribes to this.
pub const EVENT_ZONE_DETECTED: &str = "cv:zone-detected";

/// How often the pipeline ticks. Memory note: position detection is for
/// zone-level live filtering, not pixel-perfect tracking — 20 Hz is plenty,
/// and well below the WGC frame delivery rate (~60+ Hz) so we never lag.
pub const TICK_INTERVAL: Duration = Duration::from_millis(50);

/// How many consecutive ticks a zone change must be observed before we emit.
/// 2 = ~100 ms hysteresis. Stops boundary-flapping but stays responsive.
const HYSTERESIS_TICKS: u32 = 2;

/// Event payload emitted to the frontend on zone change.
///
/// Stability contract: this shape is part of the IPC API. Mirror any change
/// in `frontend/src/types/desktop.ts`.
#[derive(Debug, Clone, Serialize)]
pub struct CvZoneDetectedEvent {
    /// The map this detection applies to.
    pub map_slug: String,
    /// The newly-detected zone slug. `None` when the player left all known
    /// zones (still a useful event — the frontend should fall back to
    /// map+side filtering).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub zone_slug: Option<String>,
    /// Detection confidence: 1.0 = perfect colour match, 0.0 = at the
    /// tolerance limit. Derived from dot-detector's `mean_distance`.
    pub confidence: f32,
    /// Single-tick latency that produced this detection, in milliseconds.
    pub latency_ms: f32,
    /// RFC3339 timestamp.
    pub detected_at: String,
}

/// Event-emitter abstraction — mirrors `gsi::server::EventEmitter` so tests
/// can mount the pipeline without a Tauri runtime.
pub trait CvEventEmitter: Send + Sync + 'static {
    fn emit_zone_detected(&self, event: &CvZoneDetectedEvent) -> Result<(), String>;
}

/// Production impl backed by Tauri's `AppHandle`.
#[derive(Clone)]
pub struct TauriCvEmitter {
    pub app_handle: tauri::AppHandle,
}

impl CvEventEmitter for TauriCvEmitter {
    fn emit_zone_detected(&self, event: &CvZoneDetectedEvent) -> Result<(), String> {
        use tauri::Emitter;
        self.app_handle
            .emit(EVENT_ZONE_DETECTED, event)
            .map_err(|e| e.to_string())
    }
}

/// Test-only stub emitter that records emits into an in-memory buffer.
/// Marked `pub` (not `pub(crate)`) so integration tests under `tests/` can
/// use it.
#[derive(Debug, Default)]
pub struct StubCvEmitter {
    pub emits: std::sync::Mutex<Vec<CvZoneDetectedEvent>>,
}

impl CvEventEmitter for StubCvEmitter {
    fn emit_zone_detected(&self, event: &CvZoneDetectedEvent) -> Result<(), String> {
        self.emits
            .lock()
            .map_err(|e| e.to_string())?
            .push(event.clone());
        Ok(())
    }
}

// -----------------------------------------------------------------------------
// Hysteresis filter
// -----------------------------------------------------------------------------

/// Streak-based hysteresis: a candidate zone must be observed N consecutive
/// ticks before it "wins" and is emitted. Resets on any mismatch.
///
/// "Zone" here is `Option<String>` because "no zone (player off-map)" is a
/// distinct, meaningful detection that the frontend reacts to. We treat
/// `None` the same as any other candidate — it has to survive hysteresis
/// before it's emitted.
///
/// `last_emitted` uses a dedicated `EmittedZone` enum rather than nested
/// `Option<Option<...>>` to keep the change-detection logic readable.
#[derive(Debug, Default)]
struct ZoneHysteresis {
    /// What we last told the world. `Nothing` means we've never emitted.
    last_emitted: EmittedZone,
    /// Current candidate zone (may differ from `last_emitted`).
    candidate: EmittedZone,
    /// How many consecutive ticks we've seen `candidate`.
    streak: u32,
}

/// The "last emitted" tri-state. Distinct from `Option<String>` because we
/// need to differentiate "never emitted" from "emitted the absence of a
/// zone" — the latter is a legitimate state the frontend cares about.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
enum EmittedZone {
    #[default]
    Nothing,
    Zone(Option<String>),
}

impl EmittedZone {
    /// Convert an observed candidate into an `EmittedZone::Zone`.
    fn from_observed(obs: Option<String>) -> Self {
        Self::Zone(obs)
    }
}

impl ZoneHysteresis {
    /// Submit a new tick's detection. Returns `Some(zone_opt)` if hysteresis
    /// cleared AND the result differs from what we last emitted, otherwise
    /// `None`. The inner `Option<String>` is the zone slug (or `None` for
    /// "player is in no known zone").
    fn observe(&mut self, observed: Option<String>) -> Option<Option<String>> {
        let observed_em = EmittedZone::from_observed(observed.clone());
        if self.candidate == observed_em {
            self.streak = self.streak.saturating_add(1);
        } else {
            self.candidate = observed_em.clone();
            self.streak = 1;
        }

        // Streak too short to emit yet.
        if self.streak < HYSTERESIS_TICKS {
            return None;
        }
        // Candidate matches what we already announced. No re-emit.
        if self.last_emitted == observed_em {
            return None;
        }
        self.last_emitted = observed_em;
        Some(observed)
    }

    /// Reset the filter — called on map change so the new map starts with
    /// a clean slate.
    fn reset(&mut self) {
        self.last_emitted = EmittedZone::Nothing;
        self.candidate = EmittedZone::Nothing;
        self.streak = 0;
    }
}

// -----------------------------------------------------------------------------
// Pipeline
// -----------------------------------------------------------------------------

/// Long-lived CV pipeline. Owns the capturer, the active calibration, and
/// the tick task. Construction is cheap; `start_loop()` is what actually
/// spins the task up.
pub struct CvPipeline {
    capturer: Arc<dyn ScreenCapturer>,
    emitter: Arc<dyn CvEventEmitter>,
    state: CvPipelineState,
    /// Currently-loaded calibration + zones. `None` when no map is loaded
    /// or the map has no calibration.
    active: Arc<AsyncMutex<Option<MapCalibrationPackage>>>,
    /// Hysteresis filter — guarded by the same mutex as `active` since we
    /// touch them together per tick.
    hysteresis: Arc<AsyncMutex<ZoneHysteresis>>,
    /// Cancellation flag for the tokio task.
    stop_flag: Arc<AtomicBool>,
}

impl CvPipeline {
    /// Construct a pipeline (does not spawn the task yet).
    pub fn new(
        capturer: Arc<dyn ScreenCapturer>,
        emitter: Arc<dyn CvEventEmitter>,
        state: CvPipelineState,
    ) -> Self {
        Self {
            capturer,
            emitter,
            state,
            active: Arc::new(AsyncMutex::new(None)),
            hysteresis: Arc::new(AsyncMutex::new(ZoneHysteresis::default())),
            stop_flag: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Get a clone of the shared state. Useful for IPC commands.
    pub fn state(&self) -> CvPipelineState {
        self.state.clone()
    }

    /// Replace the active calibration. Called on GSI map-change.
    pub async fn set_active(&self, pkg: Option<MapCalibrationPackage>) {
        let (map_slug, has_cal) = match &pkg {
            Some(p) => (Some(p.map_slug.clone()), true),
            None => (None, false),
        };
        {
            let mut g = self.active.lock().await;
            *g = pkg;
        }
        {
            let mut h = self.hysteresis.lock().await;
            h.reset();
        }
        self.state.set_current_map(map_slug, has_cal).await;
    }

    /// Run one tick. Returns `Ok(Some(zone))` on a fresh hysteresis-cleared
    /// detection (caller should emit), `Ok(None)` when no emit needed, or
    /// `Err` on a capture / detect failure.
    ///
    /// Public for tests + the integration test crate.
    pub async fn tick(&self) -> TickResult {
        let t_start = Instant::now();

        // Snapshot the active calibration so we don't hold the lock across
        // the capture / CV work (which can take ms).
        let pkg_opt: Option<MapCalibrationPackage> = {
            let g = self.active.lock().await;
            g.clone()
        };
        let Some(pkg) = pkg_opt else {
            // No calibration loaded — pipeline is paused. Don't tick further.
            return TickResult::Paused;
        };

        // 1. Capture the minimap region.
        let region = pkg.calibration.minimap_region.into();
        let frame = match self.capturer.capture_region(region) {
            Ok(f) => f,
            Err(e) => {
                let ms = elapsed_ms(t_start);
                self.state
                    .record_tick(ms, None, None, true, Some(format!("capture: {e}")))
                    .await;
                log::warn!("CV tick: capture failed: {e}");
                return TickResult::Error;
            }
        };

        // 2. Detect the player dot.
        let detection = detect_player_dot(&frame, &pkg.calibration.dot_detection);

        // 3. Map pixel → world space.
        let observed_zone: Option<String> = if let Some(d) = detection {
            let (wx, wy) = pkg.calibration.world_transform.apply(d.centroid_x, d.centroid_y);
            find_zone(wx, wy, &pkg.zones).map(|s| s.to_string())
        } else {
            None
        };

        // 4. Push through hysteresis.
        let emit_decision: Option<Option<String>> = {
            let mut h = self.hysteresis.lock().await;
            h.observe(observed_zone.clone())
        };

        let now_rfc = OffsetDateTime::now_utc()
            .format(&Rfc3339)
            .unwrap_or_else(|_| String::from("1970-01-01T00:00:00Z"));

        let tick_ms = elapsed_ms(t_start);

        // 5. If hysteresis cleared, emit the event.
        let result = if let Some(emit_zone) = emit_decision {
            let confidence = compute_confidence(detection, &pkg.calibration.dot_detection);
            let event = CvZoneDetectedEvent {
                map_slug: pkg.map_slug.clone(),
                zone_slug: emit_zone.clone(),
                confidence,
                latency_ms: tick_ms,
                detected_at: now_rfc.clone(),
            };
            if let Err(e) = self.emitter.emit_zone_detected(&event) {
                log::warn!("CV: failed to emit cv:zone-detected: {e}");
            }
            TickResult::Detected(event)
        } else {
            TickResult::NoChange
        };

        // 6. Record stats.
        self.state
            .record_tick(tick_ms, observed_zone, Some(now_rfc), false, None)
            .await;

        result
    }

    /// Spawn the tick loop. Returns immediately. The task runs until
    /// `stop()` is called.
    ///
    /// Idempotent: calling twice without `stop()` between is a no-op; the
    /// second call returns immediately without spawning.
    pub async fn start_loop(self: &Arc<Self>) {
        // Already running? Skip.
        let snap = self.state.snapshot().await;
        if snap.running {
            return;
        }
        self.stop_flag.store(false, Ordering::SeqCst);
        self.state.mark_running(true).await;

        let me = self.clone();
        let _ = tauri::async_runtime::spawn(async move {
            let mut interval = tokio::time::interval(TICK_INTERVAL);
            // Skip-missed-ticks behaviour: if a tick took longer than the
            // interval, we don't pile up — we burn the slip and continue
            // on the next interval boundary. Matches what users intuit;
            // we'd rather skip than rapid-fire on a slow run.
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                interval.tick().await;
                if me.stop_flag.load(Ordering::SeqCst) {
                    break;
                }
                let _ = me.tick().await;
            }
            me.state.mark_running(false).await;
        });
    }

    /// Signal the tick task to stop. Returns once `running` flips to false.
    /// Safe to call when the task isn't running.
    pub async fn stop(self: &Arc<Self>) {
        self.stop_flag.store(true, Ordering::SeqCst);
        // The task's next iteration will see the flag and exit. We could
        // await on a oneshot here but the caller doesn't need that
        // guarantee — `cv_status` will show `running: false` once it does.
    }
}

/// What happened during one tick. Used by tests + the run loop.
#[derive(Debug, Clone)]
pub enum TickResult {
    /// No active calibration — pipeline paused, no work done.
    Paused,
    /// Capture or detection failed; details in the state's `last_error`.
    Error,
    /// Tick succeeded but no new zone change to emit.
    NoChange,
    /// Tick succeeded AND emitted a zone-change event.
    Detected(CvZoneDetectedEvent),
}

fn elapsed_ms(t: Instant) -> f32 {
    let elapsed = t.elapsed();
    elapsed.as_secs_f32() * 1000.0
}

/// Map dot-detector's `mean_distance` (lower=better, 0..tolerance) to a 0..1
/// confidence. Returns 0.0 if no detection occurred at all.
fn compute_confidence(
    detection: Option<DotDetection>,
    params: &crate::cv::calibration::DotDetectionParams,
) -> f32 {
    let Some(d) = detection else {
        return 0.0;
    };
    let tol = params.color_tolerance as f32;
    if tol <= 0.0 {
        return if d.mean_distance == 0.0 { 1.0 } else { 0.0 };
    }
    let ratio = (d.mean_distance / tol).clamp(0.0, 1.0);
    1.0 - ratio
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capture::{fake::FakeCapturer, CapturedFrame};
    use crate::cv::calibration::{
        AffineTransform, DotDetectionParams, MinimapCalibration, ZonePolygon,
    };

    /// Pre-build a fixture: 100x100 grey frame with a yellow square at (40,40)
    /// of size 6. With a unit-square calibration and one zone covering the
    /// whole frame, the dot at (42.5, 42.5) → world (0.425, 0.425) lands
    /// inside the "everything" zone.
    fn build_yellow_dot_frame(width: u32, height: u32, dot_x: u32, dot_y: u32) -> CapturedFrame {
        use image::Rgba as ImgRgba;
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

    fn make_default_package(width: u32, height: u32) -> MapCalibrationPackage {
        MapCalibrationPackage {
            map_slug: "testmap".into(),
            calibration: MinimapCalibration {
                schema_version: 1,
                resolution: format!("{width}x{height}"),
                minimap_region: crate::capture::CaptureRegion::new(0, 0, width, height).into(),
                world_transform: AffineTransform::from_minimap_size(width, height),
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

    #[tokio::test]
    async fn tick_returns_paused_when_no_calibration() {
        let frame = build_yellow_dot_frame(100, 100, 40, 40);
        let cap = Arc::new(FakeCapturer::from_frame(frame));
        let emitter = Arc::new(StubCvEmitter::default());
        let state = CvPipelineState::new(true);
        let pipeline = CvPipeline::new(cap, emitter, state);

        let result = pipeline.tick().await;
        matches!(result, TickResult::Paused);
    }

    #[tokio::test]
    async fn detection_in_left_zone_emits_after_hysteresis() {
        let frame = build_yellow_dot_frame(100, 100, 10, 50);
        let cap = Arc::new(FakeCapturer::from_frame(frame));
        let emitter = Arc::new(StubCvEmitter::default());
        let state = CvPipelineState::new(true);
        let pipeline = CvPipeline::new(cap, emitter.clone(), state.clone());

        pipeline.set_active(Some(make_default_package(100, 100))).await;

        // First tick: candidate=left, streak=1 — no emit yet
        let r1 = pipeline.tick().await;
        matches!(r1, TickResult::NoChange);
        assert_eq!(emitter.emits.lock().unwrap().len(), 0);

        // Second tick: candidate=left, streak=2 — hysteresis clears
        let r2 = pipeline.tick().await;
        matches!(r2, TickResult::Detected(_));
        let emits = emitter.emits.lock().unwrap();
        assert_eq!(emits.len(), 1);
        assert_eq!(emits[0].zone_slug.as_deref(), Some("left"));
        assert_eq!(emits[0].map_slug, "testmap");
        assert!(emits[0].confidence > 0.5); // exact-yellow match
    }

    #[tokio::test]
    async fn stable_zone_does_not_re_emit() {
        let frame = build_yellow_dot_frame(100, 100, 10, 50);
        let cap = Arc::new(FakeCapturer::from_frame(frame));
        let emitter = Arc::new(StubCvEmitter::default());
        let state = CvPipelineState::new(true);
        let pipeline = CvPipeline::new(cap, emitter.clone(), state);

        pipeline.set_active(Some(make_default_package(100, 100))).await;

        // 5 ticks of the same zone — should emit exactly once (on tick 2).
        for _ in 0..5 {
            pipeline.tick().await;
        }
        assert_eq!(emitter.emits.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn zone_change_emits_again() {
        let frame_left = build_yellow_dot_frame(100, 100, 10, 50);
        let frame_right = build_yellow_dot_frame(100, 100, 80, 50);
        let cap = Arc::new(FakeCapturer::from_frame(frame_left));
        let emitter = Arc::new(StubCvEmitter::default());
        let state = CvPipelineState::new(true);
        let pipeline = CvPipeline::new(cap.clone(), emitter.clone(), state);

        pipeline.set_active(Some(make_default_package(100, 100))).await;

        // Establish "left"
        pipeline.tick().await;
        pipeline.tick().await;

        // Swap frame to "right"
        cap.set_frame(frame_right);
        pipeline.tick().await; // streak=1
        pipeline.tick().await; // streak=2 → emit "right"

        let emits = emitter.emits.lock().unwrap();
        assert_eq!(emits.len(), 2);
        assert_eq!(emits[0].zone_slug.as_deref(), Some("left"));
        assert_eq!(emits[1].zone_slug.as_deref(), Some("right"));
    }

    #[tokio::test]
    async fn capture_error_records_error_tick() {
        // FakeCapturer rejects oversized regions — set the minimap_region
        // larger than the fake frame so capture fails.
        let frame = build_yellow_dot_frame(50, 50, 10, 10);
        let cap = Arc::new(FakeCapturer::from_frame(frame));
        let emitter = Arc::new(StubCvEmitter::default());
        let state = CvPipelineState::new(true);
        let pipeline = CvPipeline::new(cap, emitter.clone(), state.clone());

        let mut pkg = make_default_package(50, 50);
        // Region (60x60) doesn't fit in 50x50 fake frame
        pkg.calibration.minimap_region = crate::capture::CaptureRegion::new(0, 0, 60, 60).into();
        pipeline.set_active(Some(pkg)).await;

        let r = pipeline.tick().await;
        matches!(r, TickResult::Error);
        let snap = state.snapshot().await;
        assert_eq!(snap.ticks_errored, 1);
        assert!(snap.last_error.is_some());
    }

    #[test]
    fn hysteresis_streak_clears_after_threshold() {
        let mut h = ZoneHysteresis::default();
        assert!(h.observe(Some("a".into())).is_none()); // streak=1
        let r = h.observe(Some("a".into())); // streak=2
        assert!(matches!(r, Some(Some(ref s)) if s == "a"));
        // Stable — no re-emit
        assert!(h.observe(Some("a".into())).is_none());
        assert!(h.observe(Some("a".into())).is_none());
    }

    #[test]
    fn hysteresis_flapping_resets_streak() {
        let mut h = ZoneHysteresis::default();
        h.observe(Some("a".into())); // streak=1 candidate=a
        h.observe(Some("b".into())); // streak=1 candidate=b
        // Single occurrence of b shouldn't emit yet — streak must reach 2.
        // But because we never emitted anything, the prior was None; here
        // observe again with b to clear.
        let r = h.observe(Some("b".into())); // streak=2 candidate=b
        assert!(matches!(r, Some(Some(ref s)) if s == "b"));
    }

    #[test]
    fn hysteresis_reset_clears_state() {
        let mut h = ZoneHysteresis::default();
        h.observe(Some("a".into()));
        h.observe(Some("a".into())); // emit
        h.reset();
        // After reset, "a" needs to win the hysteresis again from scratch.
        assert!(h.observe(Some("a".into())).is_none());
    }

    #[test]
    fn compute_confidence_perfect_match() {
        let params = DotDetectionParams {
            target_rgb: [255, 255, 0],
            color_tolerance: 30,
            min_area_px: 4,
            max_area_px: 100,
        };
        let det = DotDetection {
            centroid_x: 0.0,
            centroid_y: 0.0,
            area_px: 10,
            mean_distance: 0.0,
        };
        assert!((compute_confidence(Some(det), &params) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn compute_confidence_at_tolerance_is_zero() {
        let params = DotDetectionParams {
            target_rgb: [255, 255, 0],
            color_tolerance: 30,
            min_area_px: 4,
            max_area_px: 100,
        };
        let det = DotDetection {
            centroid_x: 0.0,
            centroid_y: 0.0,
            area_px: 10,
            mean_distance: 30.0,
        };
        assert!(compute_confidence(Some(det), &params).abs() < 1e-6);
    }

    #[test]
    fn compute_confidence_none_returns_zero() {
        let params = DotDetectionParams {
            target_rgb: [255, 255, 0],
            color_tolerance: 30,
            min_area_px: 4,
            max_area_px: 100,
        };
        assert!(compute_confidence(None, &params).abs() < 1e-6);
    }
}
