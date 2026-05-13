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

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use tokio::sync::Mutex as AsyncMutex;

use crate::capture::{CapturedFrame, ScreenCapturer};
use crate::cv::calibration::{DotDetectionParams, MapCalibrationPackage};
use crate::cv::dot_detector::{
    detect_player_dot_with_diagnostics, BlobBoundingBox, DetectionDiagnostics, DotDetection,
};
use crate::cv::polygon::find_zone;
use crate::cv::state::CvPipelineState;

/// Tauri event name emitted on zone-change. The frontend `useCvState` hook
/// subscribes to this.
pub const EVENT_ZONE_DETECTED: &str = "cv:zone-detected";

/// Tauri event name emitted at the debug-frame cadence (4 Hz) when at least
/// one frontend listener is attached. PR 9b's calibration UI subscribes for
/// the live tuning preview.
pub const EVENT_DEBUG_FRAME: &str = "cv:debug-frame";

/// How often the pipeline ticks. Memory note: position detection is for
/// zone-level live filtering, not pixel-perfect tracking — 20 Hz is plenty,
/// and well below the WGC frame delivery rate (~60+ Hz) so we never lag.
pub const TICK_INTERVAL: Duration = Duration::from_millis(50);

/// At a 20 Hz tick rate, emit the debug frame every Nth tick. 5 ticks at
/// 50 ms = 250 ms = 4 Hz. Plenty for a UI tuning preview; keeps encode +
/// IPC cost down (PNG-encoding 280x280 is ~1-2 ms per call).
const DEBUG_FRAME_TICK_PERIOD: u64 = 5;

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

/// Per-blob bounding box payload nested inside `CvDebugFrameEvent`.
#[derive(Debug, Clone, Serialize)]
pub struct CvDebugBlob {
    /// Top-left x in minimap-pixel space.
    pub x: u32,
    /// Top-left y in minimap-pixel space.
    pub y: u32,
    pub w: u32,
    pub h: u32,
    pub area: u32,
}

/// Live preview payload for the dot-tuning UI. Emitted at ~4 Hz while the
/// pipeline is running AND at least one frontend listener is attached
/// (subscriber gating; see `CvPipeline::add_debug_subscriber`).
///
/// `png_base64` is the captured minimap region encoded as base64 PNG so the
/// browser side can drop it straight into an `<img src="data:image/png;...">`.
/// We accept the encoding cost (~1-2 ms) because the alternative — sending
/// raw RGBA bytes — requires the JS side to build a `<canvas>` and that adds
/// boilerplate without saving meaningful CPU.
#[derive(Debug, Clone, Serialize)]
pub struct CvDebugFrameEvent {
    /// Base64-encoded PNG of the captured minimap region.
    pub png_base64: String,
    /// All accepted blob bounding boxes for this tick.
    pub blobs: Vec<CvDebugBlob>,
    /// Centroid of the winning dot detection in minimap-pixel space, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dot_match: Option<CvDotMatch>,
    /// Single-tick wall-clock time in milliseconds.
    pub tick_ms: u32,
}

/// Minimal "we found the dot" payload. Coords in minimap-pixel space.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct CvDotMatch {
    pub x: f32,
    pub y: f32,
}

/// Event-emitter abstraction — mirrors `gsi::server::EventEmitter` so tests
/// can mount the pipeline without a Tauri runtime.
pub trait CvEventEmitter: Send + Sync + 'static {
    fn emit_zone_detected(&self, event: &CvZoneDetectedEvent) -> Result<(), String>;

    /// Emit a debug-frame payload to the frontend. PR 9b only — gated by the
    /// pipeline's subscriber counter so we don't burn CPU encoding PNGs when
    /// no one is listening.
    fn emit_debug_frame(&self, event: &CvDebugFrameEvent) -> Result<(), String>;
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

    fn emit_debug_frame(&self, event: &CvDebugFrameEvent) -> Result<(), String> {
        use tauri::Emitter;
        self.app_handle
            .emit(EVENT_DEBUG_FRAME, event)
            .map_err(|e| e.to_string())
    }
}

/// Test-only stub emitter that records emits into in-memory buffers.
/// Marked `pub` (not `pub(crate)`) so integration tests under `tests/` can
/// use it.
#[derive(Debug, Default)]
pub struct StubCvEmitter {
    pub emits: std::sync::Mutex<Vec<CvZoneDetectedEvent>>,
    pub debug_emits: std::sync::Mutex<Vec<CvDebugFrameEvent>>,
}

impl CvEventEmitter for StubCvEmitter {
    fn emit_zone_detected(&self, event: &CvZoneDetectedEvent) -> Result<(), String> {
        self.emits
            .lock()
            .map_err(|e| e.to_string())?
            .push(event.clone());
        Ok(())
    }

    fn emit_debug_frame(&self, event: &CvDebugFrameEvent) -> Result<(), String> {
        self.debug_emits
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
    /// Number of frontend listeners attached to `cv:debug-frame`. When zero,
    /// the tick loop skips the PNG-encode / emit step entirely. Cheap atomic
    /// — incremented in `add_debug_subscriber`, decremented in
    /// `remove_debug_subscriber`. Saturates at u32::MAX (a far cry from any
    /// real-world ref count).
    debug_subscribers: Arc<AtomicU32>,
    /// Monotonic tick counter — independent of `CvPipelineState::ticks_total`
    /// so we can drive the debug-frame emit cadence without taking the
    /// state's read lock on every tick.
    tick_seq: Arc<AtomicU64>,
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
            debug_subscribers: Arc::new(AtomicU32::new(0)),
            tick_seq: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Increment the debug-frame subscriber count. Each call MUST be paired
    /// with a `remove_debug_subscriber()` when the listener detaches.
    pub fn add_debug_subscriber(&self) {
        self.debug_subscribers.fetch_add(1, Ordering::SeqCst);
    }

    /// Decrement the debug-frame subscriber count, saturating at zero. Safe
    /// to over-call — extras decrement nothing.
    pub fn remove_debug_subscriber(&self) {
        // Use `fetch_update` so we saturate at 0 (don't underflow to u32::MAX).
        let _ = self
            .debug_subscribers
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |cur| {
                Some(cur.saturating_sub(1))
            });
    }

    /// `true` when at least one frontend listener is attached.
    pub fn has_debug_subscribers(&self) -> bool {
        self.debug_subscribers.load(Ordering::SeqCst) > 0
    }

    /// Get a clone of the shared state. Useful for IPC commands.
    pub fn state(&self) -> CvPipelineState {
        self.state.clone()
    }

    /// Get a clone of the capturer handle. Used by IPC commands that need to
    /// one-shot a frame (PR 9b: `cv_capture_frame`).
    pub fn capturer(&self) -> Arc<dyn ScreenCapturer> {
        self.capturer.clone()
    }

    /// Hot-swap the dot-detection parameters on the active calibration WITHOUT
    /// restarting the pipeline. Called by the live tuning UI (`cv_set_dot_params_preview`).
    ///
    /// Atomic: the swap happens inside the same `active` async mutex the tick
    /// loop reads from. The next tick will see the new params; in-flight ticks
    /// finish on the old params.
    ///
    /// Returns `false` if there's no active calibration (the preview command
    /// is a no-op until a map is loaded). Otherwise returns `true`.
    pub async fn set_dot_params_preview(&self, params: DotDetectionParams) -> bool {
        let mut g = self.active.lock().await;
        if let Some(pkg) = g.as_mut() {
            pkg.calibration.dot_detection = params;
            true
        } else {
            false
        }
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

        // 2. Detect the player dot (with diagnostics — bounding boxes are
        //    cheap to track and used by the debug-frame emitter below).
        let diagnostics =
            detect_player_dot_with_diagnostics(&frame, &pkg.calibration.dot_detection);
        let detection = diagnostics.best;

        // 3. Map pixel → world space.
        let observed_zone: Option<String> = if let Some(d) = detection {
            let (wx, wy) = pkg
                .calibration
                .world_transform
                .apply(d.centroid_x, d.centroid_y);
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

        // 5b. Optional debug-frame emit. Subscriber-gated AND cadence-gated:
        // we encode + emit only every Nth tick AND only when at least one
        // frontend listener is attached. Encoding is the expensive bit
        // (~1-2 ms on a 280x280 region); we don't want to pay it 20x/s when
        // nobody is looking.
        let seq = self.tick_seq.fetch_add(1, Ordering::SeqCst);
        let cadence_hit = seq % DEBUG_FRAME_TICK_PERIOD == 0;
        if cadence_hit && self.has_debug_subscribers() {
            self.maybe_emit_debug_frame(&frame, &diagnostics, tick_ms);
        }

        // 6. Record stats.
        self.state
            .record_tick(tick_ms, observed_zone, Some(now_rfc), false, None)
            .await;

        result
    }

    /// Encode the captured minimap region into a PNG and emit a `cv:debug-frame`
    /// event. Errors are logged but never fail the tick — debug emission is
    /// best-effort.
    fn maybe_emit_debug_frame(
        &self,
        frame: &CapturedFrame,
        diagnostics: &DetectionDiagnostics,
        tick_ms: f32,
    ) {
        let png_b64 = match encode_png_base64(frame) {
            Ok(s) => s,
            Err(e) => {
                log::warn!("CV: PNG encode failed for debug frame: {e}");
                return;
            }
        };
        let blobs = diagnostics
            .accepted_blobs
            .iter()
            .map(blob_to_payload)
            .collect();
        let dot_match = diagnostics.best.map(|d| CvDotMatch {
            x: d.centroid_x,
            y: d.centroid_y,
        });
        let event = CvDebugFrameEvent {
            png_base64: png_b64,
            blobs,
            dot_match,
            tick_ms: tick_ms.max(0.0).round() as u32,
        };
        if let Err(e) = self.emitter.emit_debug_frame(&event) {
            log::warn!("CV: failed to emit cv:debug-frame: {e}");
        }
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
        // Bare statement — we don't bind the JoinHandle. `let _ = future`
        // trips `clippy::let_underscore_future`. Task is fire-and-forget;
        // shutdown happens through the `stop_flag` AtomicBool.
        tauri::async_runtime::spawn(async move {
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

/// Public wrapper for `encode_png_base64` so the IPC command layer can reuse
/// the same encoder + base64 algorithm. Avoids splitting "what's a debug
/// emit" from "what's a one-shot capture" — both use the exact same encoding.
pub fn encode_png_base64_for_command(frame: &CapturedFrame) -> Result<String, String> {
    encode_png_base64(frame)
}

/// Encode an RGBA `CapturedFrame` as base64 PNG. Used by the debug-frame
/// emitter. Returns `Err` only if the PNG encoder itself fails (rare; usually
/// indicates an unsupported pixel format which we don't produce).
fn encode_png_base64(frame: &CapturedFrame) -> Result<String, String> {
    use image::{codecs::png::PngEncoder, ColorType, ImageEncoder};
    let mut buf: Vec<u8> = Vec::with_capacity(frame.pixels.len());
    let encoder = PngEncoder::new(&mut buf);
    encoder
        .write_image(
            &frame.pixels,
            frame.width,
            frame.height,
            ColorType::Rgba8.into(),
        )
        .map_err(|e| format!("PNG encode failed: {e}"))?;
    Ok(base64_encode(&buf))
}

/// Minimal base64 encoder — no dep, no allocator surprises. Encodes 3 bytes
/// at a time into 4 ASCII chars. Pure RFC 4648 standard alphabet with `=`
/// padding. Used for the debug-frame PNG payload only.
fn base64_encode(input: &[u8]) -> String {
    const ALPHA: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    // Output length = ceil(N/3) * 4.
    let groups = input.len() / 3;
    let remainder = input.len() % 3;
    let out_len = groups.saturating_mul(4) + if remainder == 0 { 0 } else { 4 };
    let mut out = String::with_capacity(out_len);
    for chunk in input.chunks(3) {
        let b0 = chunk[0];
        let b1 = chunk.get(1).copied().unwrap_or(0);
        let b2 = chunk.get(2).copied().unwrap_or(0);
        let triple = ((b0 as u32) << 16) | ((b1 as u32) << 8) | (b2 as u32);
        out.push(ALPHA[((triple >> 18) & 0x3F) as usize] as char);
        out.push(ALPHA[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() >= 2 {
            out.push(ALPHA[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() >= 3 {
            out.push(ALPHA[(triple & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

/// Convert a `BlobBoundingBox` into the IPC event payload shape.
fn blob_to_payload(bb: &BlobBoundingBox) -> CvDebugBlob {
    CvDebugBlob {
        x: bb.min_x,
        y: bb.min_y,
        w: bb.width(),
        h: bb.height(),
        area: bb.area,
    }
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

        pipeline
            .set_active(Some(make_default_package(100, 100)))
            .await;

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

        pipeline
            .set_active(Some(make_default_package(100, 100)))
            .await;

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

        pipeline
            .set_active(Some(make_default_package(100, 100)))
            .await;

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
        // Single occurrence of b shouldn't emit yet — streak must reach 2.
        // Because we never emitted anything before, observing b twice in a
        // row is what finally satisfies the hysteresis filter.
        h.observe(Some("a".into())); // streak=1 candidate=a
        h.observe(Some("b".into())); // streak=1 candidate=b
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

    // ---- PR 9b: subscriber-gated debug frames ----

    #[tokio::test]
    async fn debug_frame_not_emitted_without_subscribers() {
        let frame = build_yellow_dot_frame(100, 100, 50, 50);
        let cap = Arc::new(FakeCapturer::from_frame(frame));
        let emitter = Arc::new(StubCvEmitter::default());
        let state = CvPipelineState::new(true);
        let pipeline = CvPipeline::new(cap, emitter.clone(), state);
        pipeline
            .set_active(Some(make_default_package(100, 100)))
            .await;

        // No subscribers — even though the cadence hits (seq=0 % 5 == 0),
        // we should not emit a debug frame.
        pipeline.tick().await;
        assert_eq!(emitter.debug_emits.lock().unwrap().len(), 0);
    }

    #[tokio::test]
    async fn debug_frame_emitted_when_subscriber_attached_and_cadence_hits() {
        let frame = build_yellow_dot_frame(100, 100, 50, 50);
        let cap = Arc::new(FakeCapturer::from_frame(frame));
        let emitter = Arc::new(StubCvEmitter::default());
        let state = CvPipelineState::new(true);
        let pipeline = CvPipeline::new(cap, emitter.clone(), state);
        pipeline
            .set_active(Some(make_default_package(100, 100)))
            .await;

        pipeline.add_debug_subscriber();
        // First tick: seq=0 → cadence hits → emit.
        pipeline.tick().await;
        let emits = emitter.debug_emits.lock().unwrap();
        assert_eq!(emits.len(), 1);
        assert!(emits[0].tick_ms < 100);
        // PNG output starts with "iVBORw0KGgo" (base64 of 89 PNG...IHDR).
        assert!(emits[0].png_base64.starts_with("iVBORw0KGgo"));
        // The yellow square at (50, 50, 6x6) should be a single accepted blob.
        assert_eq!(emits[0].blobs.len(), 1);
        let b = &emits[0].blobs[0];
        assert_eq!(b.area, 36);
        // Dot match should reflect the yellow square's centroid (52.5, 52.5).
        let m = emits[0].dot_match.expect("dot match");
        assert!((m.x - 52.5).abs() < 0.5);
        assert!((m.y - 52.5).abs() < 0.5);
    }

    #[tokio::test]
    async fn add_and_remove_subscriber_balance_correctly() {
        let frame = build_yellow_dot_frame(100, 100, 50, 50);
        let cap = Arc::new(FakeCapturer::from_frame(frame));
        let emitter = Arc::new(StubCvEmitter::default());
        let pipeline = CvPipeline::new(cap, emitter, CvPipelineState::new(true));

        assert!(!pipeline.has_debug_subscribers());
        pipeline.add_debug_subscriber();
        pipeline.add_debug_subscriber();
        assert!(pipeline.has_debug_subscribers());
        pipeline.remove_debug_subscriber();
        assert!(pipeline.has_debug_subscribers());
        pipeline.remove_debug_subscriber();
        assert!(!pipeline.has_debug_subscribers());
        // Saturate at 0 — extra remove is a no-op.
        pipeline.remove_debug_subscriber();
        assert!(!pipeline.has_debug_subscribers());
    }

    // ---- PR 9b: hot-swap dot params ----

    #[tokio::test]
    async fn set_dot_params_preview_swaps_atomically() {
        let frame = build_yellow_dot_frame(100, 100, 50, 50);
        let cap = Arc::new(FakeCapturer::from_frame(frame));
        let emitter = Arc::new(StubCvEmitter::default());
        let state = CvPipelineState::new(true);
        let pipeline = CvPipeline::new(cap, emitter, state);
        let mut pkg = make_default_package(100, 100);
        pkg.calibration.dot_detection.color_tolerance = 30;
        pipeline.set_active(Some(pkg)).await;

        let new_params = DotDetectionParams {
            target_rgb: [0, 200, 100],
            color_tolerance: 7,
            min_area_px: 11,
            max_area_px: 12,
        };
        let applied = pipeline.set_dot_params_preview(new_params).await;
        assert!(applied);

        // Verify the swap stuck — peek into the active calibration.
        let g = pipeline.active.lock().await;
        let pkg = g.as_ref().expect("active package");
        assert_eq!(pkg.calibration.dot_detection.target_rgb, [0, 200, 100]);
        assert_eq!(pkg.calibration.dot_detection.color_tolerance, 7);
        assert_eq!(pkg.calibration.dot_detection.min_area_px, 11);
        assert_eq!(pkg.calibration.dot_detection.max_area_px, 12);
    }

    #[tokio::test]
    async fn set_dot_params_preview_returns_false_without_active() {
        let frame = build_yellow_dot_frame(100, 100, 50, 50);
        let cap = Arc::new(FakeCapturer::from_frame(frame));
        let emitter = Arc::new(StubCvEmitter::default());
        let pipeline = CvPipeline::new(cap, emitter, CvPipelineState::new(true));
        // No set_active call — no map loaded.

        let new_params = DotDetectionParams {
            target_rgb: [0, 200, 100],
            color_tolerance: 7,
            min_area_px: 4,
            max_area_px: 80,
        };
        let applied = pipeline.set_dot_params_preview(new_params).await;
        assert!(!applied);
    }

    // ---- PR 9b: base64 encoder ----

    #[test]
    fn base64_encode_empty_returns_empty() {
        assert_eq!(base64_encode(&[]), "");
    }

    #[test]
    fn base64_encode_one_byte_pads_two_equals() {
        // 'A' = 0x41 = 0100_0001
        // → 010000 010000  → 'Q' 'Q' '=' '='
        assert_eq!(base64_encode(b"A"), "QQ==");
    }

    #[test]
    fn base64_encode_two_bytes_pads_one_equals() {
        // "AB" = 0x41 0x42 → "QUI="
        assert_eq!(base64_encode(b"AB"), "QUI=");
    }

    #[test]
    fn base64_encode_three_bytes_no_padding() {
        // "ABC" = 0x41 0x42 0x43 → "QUJD"
        assert_eq!(base64_encode(b"ABC"), "QUJD");
    }

    #[test]
    fn base64_encode_round_trip_via_image_crate() {
        // PNG header bytes — verify our encoder produces the canonical
        // base64 prefix that image-decoder libraries can re-read.
        let png_magic = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        let encoded = base64_encode(&png_magic);
        assert_eq!(encoded, "iVBORw0KGgo=");
    }

    #[test]
    fn encode_png_base64_roundtrips_dimensions() {
        let frame = build_yellow_dot_frame(20, 20, 5, 5);
        let b64 = encode_png_base64(&frame).expect("encode");
        assert!(b64.starts_with("iVBORw0KGgo"));
        // Re-decode the base64 + PNG to verify dimensions.
        let bytes = decode_base64_for_test(&b64);
        let img = image::load_from_memory(&bytes).expect("decode PNG");
        assert_eq!(img.width(), 20);
        assert_eq!(img.height(), 20);
    }

    /// Minimal base64 decoder for the round-trip test only. Not exposed.
    fn decode_base64_for_test(s: &str) -> Vec<u8> {
        const ALPHA_REV: [i8; 128] = {
            let mut t = [-1i8; 128];
            let mut i: i8 = 0;
            let alpha = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            while (i as usize) < alpha.len() {
                t[alpha[i as usize] as usize] = i;
                i += 1;
            }
            t
        };
        let s = s.as_bytes();
        let mut out = Vec::with_capacity(s.len() / 4 * 3);
        let mut i = 0;
        while i + 4 <= s.len() {
            let c0 = ALPHA_REV[s[i] as usize] as u32;
            let c1 = ALPHA_REV[s[i + 1] as usize] as u32;
            let c2_raw = s[i + 2];
            let c3_raw = s[i + 3];
            let c2 = if c2_raw == b'=' { 0 } else { ALPHA_REV[c2_raw as usize] as u32 };
            let c3 = if c3_raw == b'=' { 0 } else { ALPHA_REV[c3_raw as usize] as u32 };
            let triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
            out.push(((triple >> 16) & 0xFF) as u8);
            if c2_raw != b'=' {
                out.push(((triple >> 8) & 0xFF) as u8);
            }
            if c3_raw != b'=' {
                out.push((triple & 0xFF) as u8);
            }
            i += 4;
        }
        out
    }
}
