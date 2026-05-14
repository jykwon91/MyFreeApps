//! Tauri IPC commands for the CV pipeline.
//!
//! Exposed to the frontend via `invoke("...")`:
//!
//! - `cv_status` — returns the current `CvStatusSnapshot`.
//! - `cv_start` — spins up the tick loop.
//! - `cv_stop` — tears it down.
//! - `cv_get_calibration` — returns the calibration for a map (bundled or
//!   operator-edited). Used by PR 9b's editor.
//! - `cv_set_calibration` — persists an operator-edited calibration to
//!   `<app_config_dir>/cv_calibrations/...`. PR 9a wires this as functional
//!   but no UI uses it yet; PR 9b will hit it from the editor page.
//!
//! All commands MUST work both with and without a CV pipeline registered as
//! Tauri-managed state. PR 9a registers the pipeline conditionally
//! (only when the platform supports capture). On Mac/Linux it's not
//! registered; we look it up via `try_state` and return a sane stub status
//! rather than failing the command.

use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use tauri::Manager;

use crate::capture::MonitorResolution;
use crate::cv::calibration::{
    bundled::load_bundled_calibration, DotDetectionParams, MapCalibrationPackage,
};
use crate::cv::pipeline::CvPipeline;
use crate::cv::state::{CvPipelineState, CvStatusSnapshot};

/// Return the current pipeline status. Cheap; safe to poll at 1 Hz.
///
/// On platforms without a capture backend, returns a snapshot reflecting
/// `platform_supported=false` so the UI can render a clear "Windows only"
/// message instead of "stopped".
#[tauri::command]
pub async fn cv_status(app: tauri::AppHandle) -> Result<CvStatusSnapshot, String> {
    if let Some(state) = app.try_state::<CvPipelineState>() {
        return Ok(state.snapshot().await);
    }
    Ok(CvStatusSnapshot {
        running: false,
        platform_supported: false,
        current_map: None,
        last_zone: None,
        last_detection_at: None,
        ticks_total: 0,
        ticks_errored: 0,
        avg_tick_ms: 0.0,
        last_tick_ms: 0.0,
        calibration_loaded: false,
        last_error: None,
    })
}

/// Start the CV pipeline. No-op when already running.
///
/// On a platform without capture support, returns an error (Tauri converts
/// the `Result::Err` into a JS rejection); the Setup page formats it
/// user-visibly. `cv-platform-not-supported` is a sentinel string the
/// frontend special-cases — see `LiveCs2CvPanel.formatStartError`.
#[tauri::command]
pub async fn cv_start(app: tauri::AppHandle) -> Result<(), String> {
    let pipeline = match app.try_state::<Arc<CvPipeline>>() {
        Some(s) => s.inner().clone(),
        None => return Err("cv-platform-not-supported".into()),
    };
    pipeline.start_loop().await;
    Ok(())
}

/// Stop the CV pipeline. No-op when not running.
#[tauri::command]
pub async fn cv_stop(app: tauri::AppHandle) -> Result<(), String> {
    let pipeline = match app.try_state::<Arc<CvPipeline>>() {
        Some(s) => s.inner().clone(),
        None => return Ok(()), // Nothing to stop.
    };
    pipeline.stop().await;
    Ok(())
}

/// Read the calibration for a map. Resolution order:
///   1. Operator-edited override under `<app_config_dir>/cv_calibrations/<slug>_<res>.json`.
///   2. Bundled default (PR 9a ships `de_mirage_1920x1080`).
///   3. `None`.
///
/// PR 9a uses this from the Setup page to display "calibration loaded:
/// yes/no" for the current map. PR 9b will use it to seed the editor.
#[tauri::command]
pub async fn cv_get_calibration(
    map_slug: String,
    resolution: String,
    app: tauri::AppHandle,
) -> Result<Option<MapCalibrationPackage>, String> {
    if let Some(pkg) = read_user_calibration(&app, &map_slug, &resolution) {
        return Ok(Some(pkg));
    }
    Ok(load_bundled_calibration(&map_slug, &resolution))
}

/// Persist an operator-edited calibration. Writes to
/// `<app_config_dir>/cv_calibrations/<slug>_<resolution>.json`.
///
/// PR 9a exposes this command but no frontend UI hits it yet. PR 9b's editor
/// posts the calibration here on save.
#[tauri::command]
pub async fn cv_set_calibration(
    pkg: MapCalibrationPackage,
    resolution: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let dir = calibrations_dir(&app)?;
    if let Err(e) = std::fs::create_dir_all(&dir) {
        return Err(format!("failed to create calibrations dir: {e}"));
    }
    let path = dir.join(format!("{}_{resolution}.json", pkg.map_slug));
    let json = serde_json::to_string_pretty(&pkg)
        .map_err(|e| format!("failed to serialize calibration: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("failed to write calibration: {e}"))?;
    log::info!(
        "CV calibration saved: map={} resolution={} path={}",
        pkg.map_slug,
        resolution,
        path.display(),
    );
    Ok(path.to_string_lossy().into_owned())
}

// ===========================================================================
// PR 9b commands
// ===========================================================================

/// Result of `cv_capture_frame` — a one-shot screen capture of the full
/// primary display, encoded as base64 PNG. Used by PR 9b's calibration UI
/// for the region picker + dot picker flows.
///
/// Returned as JSON for two reasons:
///   1. Tauri serializes commands' returns as JSON regardless; raw bytes
///      cost the same wire-time as base64 but force a more brittle JS-side
///      decoder.
///   2. The frontend drops the string straight into `<img src="data:..." />`
///      with no further processing.
#[derive(Debug, Serialize)]
pub struct CvCaptureFrameResult {
    pub png_base64: String,
    pub width: u32,
    pub height: u32,
}

/// One-shot capture of the primary display. Encoded as base64 PNG so the
/// frontend can drop it into an `<img>` element directly. Used by PR 9b's
/// region picker and dot picker.
///
/// Fails if the platform doesn't support capture (Mac/Linux today), or if
/// no WGC frame has arrived yet (rare; usually <16 ms after start).
#[tauri::command]
pub async fn cv_capture_frame(app: tauri::AppHandle) -> Result<CvCaptureFrameResult, String> {
    let pipeline = match app.try_state::<Arc<CvPipeline>>() {
        Some(s) => s.inner().clone(),
        None => return Err("cv-platform-not-supported".into()),
    };
    let capturer = pipeline.capturer();
    let frame = capturer
        .capture_full_screen()
        .map_err(|e| format!("capture failed: {e}"))?;
    let width = frame.width;
    let height = frame.height;
    let png_base64 = crate::cv::pipeline::encode_png_base64_for_command(&frame)
        .map_err(|e| format!("PNG encode failed: {e}"))?;
    Ok(CvCaptureFrameResult {
        png_base64,
        width,
        height,
    })
}

/// Resolve the primary monitor's resolution in pixels. Used by PR 9b's
/// calibration UI to preselect a matching entry in the resolution dropdown.
///
/// Returns `cv-platform-not-supported` when no capture backend is registered.
#[tauri::command]
pub async fn cv_get_primary_monitor_resolution(
    app: tauri::AppHandle,
) -> Result<MonitorResolution, String> {
    let pipeline = match app.try_state::<Arc<CvPipeline>>() {
        Some(s) => s.inner().clone(),
        None => return Err("cv-platform-not-supported".into()),
    };
    let capturer = pipeline.capturer();
    capturer
        .primary_monitor_resolution()
        .map_err(|e| format!("monitor resolution lookup failed: {e}"))
}

/// Hot-swap the dot-detection parameters on the active calibration WITHOUT
/// persisting them or restarting the pipeline. Used by PR 9b's live tuning
/// loop — every slider change calls this so the next tick sees the new
/// params. Persist with `cv_set_calibration` once the operator is happy.
///
/// No-op when no map is active (returns `false` in `applied`). Returns an
/// error only on infrastructure-level failure (pipeline state missing).
#[tauri::command]
pub async fn cv_set_dot_params_preview(
    params: DotDetectionParams,
    app: tauri::AppHandle,
) -> Result<CvSetDotParamsPreviewResult, String> {
    let pipeline = match app.try_state::<Arc<CvPipeline>>() {
        Some(s) => s.inner().clone(),
        None => return Err("cv-platform-not-supported".into()),
    };
    let applied = pipeline.set_dot_params_preview(params).await;
    Ok(CvSetDotParamsPreviewResult { applied })
}

#[derive(Debug, Serialize)]
pub struct CvSetDotParamsPreviewResult {
    /// True when an active calibration absorbed the new params. False when
    /// no map is loaded yet — UI should still feel responsive (preview is
    /// just a no-op).
    pub applied: bool,
}

/// Delete an operator-edited calibration override. After this call, the
/// `cv_get_calibration(map_slug, resolution)` command falls back to the
/// bundled default (or returns `None` if no bundle exists for that combo).
///
/// Idempotent — succeeds even if the file doesn't exist.
#[tauri::command]
pub async fn cv_reset_calibration(
    map_slug: String,
    resolution: String,
    app: tauri::AppHandle,
) -> Result<CvResetCalibrationResult, String> {
    let dir = calibrations_dir(&app)?;
    let path = dir.join(format!("{map_slug}_{resolution}.json"));
    if !path.exists() {
        return Ok(CvResetCalibrationResult {
            removed: false,
            path: path.to_string_lossy().into_owned(),
        });
    }
    std::fs::remove_file(&path).map_err(|e| format!("failed to remove override: {e}"))?;
    log::info!(
        "CV calibration override removed: map={} resolution={} path={}",
        map_slug,
        resolution,
        path.display(),
    );
    Ok(CvResetCalibrationResult {
        removed: true,
        path: path.to_string_lossy().into_owned(),
    })
}

#[derive(Debug, Serialize)]
pub struct CvResetCalibrationResult {
    /// True when an override file was actually deleted. False when no file
    /// existed (idempotent success).
    pub removed: bool,
    /// Absolute path that was targeted. Surfaced so the frontend can show
    /// the user exactly which file got removed.
    pub path: String,
}

/// Register a frontend listener for `cv:debug-frame` events. The pipeline
/// only encodes + emits debug frames while at least one subscriber is
/// attached, to avoid burning CPU on PNG encoding when nobody is looking.
///
/// The frontend MUST call `cv_subscribe_debug_frames` before adding its
/// `event.listen(...)` and call `cv_unsubscribe_debug_frames` on unmount.
/// (See `useCvDebugFrame` in the frontend.)
#[tauri::command]
pub async fn cv_subscribe_debug_frames(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(pipeline) = app.try_state::<Arc<CvPipeline>>() {
        pipeline.inner().add_debug_subscriber();
    }
    // No-op when pipeline isn't registered (Mac/Linux) — the listener still
    // returns successfully so the frontend doesn't crash on subscribe.
    Ok(())
}

/// Companion to `cv_subscribe_debug_frames` — decrement the subscriber count.
/// Safe to call even when nothing was subscribed.
#[tauri::command]
pub async fn cv_unsubscribe_debug_frames(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(pipeline) = app.try_state::<Arc<CvPipeline>>() {
        pipeline.inner().remove_debug_subscriber();
    }
    Ok(())
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/// Resolve `<app_config_dir>/cv_calibrations/`. Wrapping `app.path().app_config_dir()`
/// in a function lets us swap it out in tests later.
fn calibrations_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("app_config_dir failed: {e}"))?;
    Ok(base.join("cv_calibrations"))
}

/// Read an operator-edited calibration from disk, or `None` if not present.
fn read_user_calibration(
    app: &tauri::AppHandle,
    map_slug: &str,
    resolution: &str,
) -> Option<MapCalibrationPackage> {
    let dir = calibrations_dir(app).ok()?;
    let path = dir.join(format!("{map_slug}_{resolution}.json"));
    if !path.exists() {
        return None;
    }
    let contents = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) => {
            log::warn!(
                "CV: failed to read operator calibration: path={} kind={:?} error={}",
                path.display(),
                e.kind(),
                e,
            );
            return None;
        }
    };
    match serde_json::from_str(&contents) {
        Ok(pkg) => Some(pkg),
        Err(e) => {
            log::warn!(
                "CV: operator calibration JSON malformed: path={} error={}",
                path.display(),
                e,
            );
            None
        }
    }
}
