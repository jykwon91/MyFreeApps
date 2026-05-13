//! Tauri IPC commands for the CV pipeline.
//!
//! Exposed to the frontend via `invoke("...")`:
//!
//!   - `cv_status`           → returns the current `CvStatusSnapshot`.
//!   - `cv_start`            → spins up the tick loop.
//!   - `cv_stop`             → tears it down.
//!   - `cv_get_calibration`  → returns the calibration for a map (bundled or
//!                              operator-edited). Used by PR 9b's editor.
//!   - `cv_set_calibration`  → persists an operator-edited calibration to
//!                              `<app_config_dir>/cv_calibrations/...`. PR 9a
//!                              wires this as functional but no UI uses it
//!                              yet; PR 9b will hit it from the editor page.
//!
//! All commands MUST work both with and without a CV pipeline registered as
//! Tauri-managed state. PR 9a registers the pipeline conditionally
//! (only when the platform supports capture). On Mac/Linux it's not
//! registered; we look it up via `try_state` and return a sane stub status
//! rather than failing the command.

use std::path::PathBuf;
use std::sync::Arc;

use tauri::Manager;

use crate::cv::calibration::{
    bundled::load_bundled_calibration, MapCalibrationPackage,
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
