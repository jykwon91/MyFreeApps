//! MyGamingAssistant Tauri desktop shell.
//!
//! PR 7: bare shell + smoke-test IPC command (`get_app_version`).
//! PR 8: CS2 GSI HTTP receiver — see `gsi/`.
//! PR 9a (this PR): minimap CV pipeline + cross-platform screen-capture
//!     abstraction. Windows path uses Windows.Graphics.Capture (same
//!     GPU-shared frame path as DXGI Desktop Duplication). Mac/Linux paths
//!     stub out cleanly; the pipeline disables itself with a clear status
//!     message rather than crashing.
//! PR 9b will add the operator-facing calibration editor UI.
//!
//! Module boundaries are intentionally drawn so later PRs slot in without
//! re-architecting:
//!   - `commands`  — Tauri IPC commands invoked from the React frontend.
//!   - `gsi`       — CS2 Game State Integration HTTP receiver (PR 8).
//!   - `capture`   — Cross-platform screen capture (PR 9a).
//!   - `cv`        — Minimap CV / player-position detection (PR 9a).
//!
//! GSI receiver lifecycle (PR 8):
//!   1. At `tauri::Builder::setup`, we load (or generate) the per-install
//!      auth token from `<app_config_dir>/cs2_gsi_auth_token`.
//!   2. We register a `GsiState` Tauri-managed state so all commands and
//!      the axum handler can share it.
//!   3. We `tokio::spawn(run_server(...))` on the Tauri-owned tokio runtime.
//!   4. On every accepted POST, the axum handler emits `gsi:state-update`
//!      and `gsi:server-status` events that the frontend subscribes to.
//!
//! CV pipeline lifecycle (PR 9a):
//!   1. At setup, attempt `capture::new_default_capturer()`. On Mac/Linux
//!      this returns `CaptureError::PlatformNotSupported` — we log it,
//!      register the `CvPipelineState` with `platform_supported=false`,
//!      and DO NOT register a `CvPipeline`. The Tauri commands degrade
//!      gracefully (returning the disabled-status snapshot).
//!   2. On Windows, we construct the pipeline + register it as
//!      Tauri-managed state. The pipeline does NOT auto-start; the
//!      frontend's "Start CV" button hits `cv_start` to spin up the tick
//!      loop.
//!   3. The GSI receiver's `gsi:state-update` event triggers
//!      `pipeline.set_active(...)` on map-change so the CV pipeline tracks
//!      whichever map CS2 is on (loading the bundled or operator-edited
//!      calibration on the way).

// Capture + CV modules — populated in PR 9a. `capture::backend_windows`
// is cfg-gated to Windows; on Mac/Linux only `backend_stub` compiles in.
pub mod capture;
mod commands;
pub mod cv;
// `pub` so integration tests under `tests/` can construct GsiState +
// drive the axum router directly. Internal callers reach in via the
// re-exports inside `gsi/mod.rs`.
pub mod gsi;

use std::path::Path;
use std::sync::Arc;

use tauri::{Listener, Manager};

use crate::cv::{
    calibration::bundled::load_bundled_calibration,
    pipeline::{CvPipeline, TauriCvEmitter},
    state::CvPipelineState,
};
use crate::gsi::{
    installer::{auth_token_path, DEFAULT_GSI_PORT},
    server::{run_server, EVENT_STATE_UPDATE},
    state::GsiState,
};

/// Minimal projection of `GsiEvent` that we need to drive the CV pipeline.
///
/// We don't deserialize the full `GsiEvent` here because that would require
/// adding `Deserialize` to its derives — which is part of PR 8's stability
/// contract with the frontend. Instead, we parse out only what we need
/// (`map_slug`) using a local struct that ignores all other fields. The
/// only downside: if PR 8 ever renames `map_slug`, this projection needs
/// updating in lockstep.
#[derive(serde::Deserialize)]
struct GsiEventProjection {
    map_slug: String,
}

/// Load the persisted auth token, or generate + persist a new one on first
/// boot.
///
/// Returns `(token, loaded_from_disk)`. The boolean is exposed to the UI so
/// users can see "auth token initialized" status without us leaking the
/// actual secret.
fn load_or_create_auth_token(app_config_dir: &Path) -> (String, bool) {
    let path = auth_token_path(app_config_dir);

    if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(s) => {
                let trimmed = s.trim().to_string();
                if !trimmed.is_empty() {
                    return (trimmed, true);
                }
                // Empty file → fall through to regenerate.
                log::warn!(
                    "GSI auth token file exists but is empty; regenerating. path={}",
                    path.display()
                );
            }
            Err(e) => {
                // Read failure → fall through. The newly-generated token
                // will overwrite on the next persist attempt.
                log::warn!(
                    "Failed to read GSI auth token: path={} kind={:?} error={}",
                    path.display(),
                    e.kind(),
                    e,
                );
            }
        }
    }

    let token = uuid::Uuid::new_v4().to_string();

    // Make sure the parent dir exists before writing.
    if let Some(parent) = path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            log::warn!(
                "Failed to create app_config_dir for GSI auth token: path={} kind={:?} error={}",
                parent.display(),
                e.kind(),
                e,
            );
            // Persisting failed; we still return the in-memory token. The
            // operator's cfg install will work for this session but the
            // token will rotate on next launch (which means CS2's cfg
            // would need re-installing). Acceptable for first-launch
            // edge-cases; not a long-term risk on a working filesystem.
            return (token, false);
        }
    }

    if let Err(e) = std::fs::write(&path, &token) {
        log::warn!(
            "Failed to persist GSI auth token: path={} kind={:?} error={}",
            path.display(),
            e.kind(),
            e,
        );
        return (token, false);
    }

    (token, true)
}

/// Run the Tauri application. Called from `main.rs`.
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_app_version,
            // Reference Tauri commands at their CANONICAL path
            // (`gsi::commands::*`) rather than the `gsi::*` re-export. The
            // `#[tauri::command]` proc-macro generates hidden
            // `__cmd__<name>` items in the SAME module as the function;
            // `pub use ... from re-export` doesn't carry those companion
            // items along, so the `generate_handler!` macro can't resolve
            // them when called via the shortcut path.
            gsi::commands::install_cs2_gsi_config,
            gsi::commands::uninstall_cs2_gsi_config,
            gsi::commands::gsi_server_status,
            gsi::commands::start_gsi_server,
            gsi::commands::stop_gsi_server,
            cv::commands::cv_status,
            cv::commands::cv_start,
            cv::commands::cv_stop,
            cv::commands::cv_get_calibration,
            cv::commands::cv_set_calibration,
        ])
        .setup(|app| {
            // Resolve the per-user app config dir. This is the canonical
            // home for the auth-token sidecar across all three platforms
            // (Windows: %APPDATA%, macOS: ~/Library/Application Support,
            // Linux: ~/.config).
            let app_config_dir = app.path().app_config_dir()?;

            let (auth_token, persisted) = load_or_create_auth_token(&app_config_dir);
            let gsi_state = GsiState::new(auth_token, persisted);
            app.manage(gsi_state.clone());

            let port = DEFAULT_GSI_PORT;
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = run_server(gsi_state, app_handle, port).await {
                    log::error!("GSI HTTP server exited with error: {e}");
                }
            });

            // ---- PR 9a: CV pipeline wiring ----
            //
            // Try to construct the capture backend. On Mac/Linux this fails
            // with `PlatformNotSupported`; we register the pipeline state
            // with `platform_supported=false` so the UI can render a clear
            // "Windows only" message, and we DO NOT register a CvPipeline
            // (so cv_start fails with a clear error instead of silently
            // ticking against a stub capturer).
            match capture::new_default_capturer() {
                Ok(cap) => {
                    let cv_state = CvPipelineState::new(true);
                    let app_for_cv_emit = app.handle().clone();
                    let emitter = Arc::new(TauriCvEmitter {
                        app_handle: app_for_cv_emit,
                    });
                    let pipeline =
                        Arc::new(CvPipeline::new(Arc::from(cap), emitter, cv_state.clone()));
                    app.manage(cv_state);
                    app.manage(pipeline.clone());

                    // Subscribe to GSI map-change events so the pipeline
                    // reloads calibration when CS2 loads a new map.
                    wire_gsi_to_cv_pipeline(app.handle().clone(), pipeline);
                }
                Err(e) => {
                    log::info!(
                        "CV pipeline disabled — capture backend unavailable on this OS: {e}"
                    );
                    // Still manage a state object so cv_status returns a
                    // sensible snapshot.
                    app.manage(CvPipelineState::new(false));
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Subscribe to `gsi:state-update` events and feed the pipeline.
///
/// Each map-change reloads the calibration for the new map. If the new map
/// has no bundled-or-edited calibration, the pipeline pauses (set_active(None)).
/// Calling this when no CV pipeline was constructed is a no-op (caller
/// already gated on capture availability).
fn wire_gsi_to_cv_pipeline(app_handle: tauri::AppHandle, pipeline: Arc<CvPipeline>) {
    let app_for_listener = app_handle.clone();
    let _event_id = app_handle.listen(EVENT_STATE_UPDATE, move |event| {
        let payload_str = event.payload().to_string();
        let pipeline = pipeline.clone();
        let app_for_resolution = app_for_listener.clone();
        // The listener callback is sync; spawn an async task to do the
        // actual work (state writes, calibration file IO). We DON'T bind
        // the JoinHandle — `let _ = <future>` trips
        // `clippy::let_underscore_future`, while a bare statement does not
        // (matches the GSI server-spawn pattern above).
        tauri::async_runtime::spawn(async move {
            handle_gsi_state_update(payload_str, pipeline, app_for_resolution).await;
        });
    });
}

/// Body of the GSI listener — split out so it's testable + readable.
async fn handle_gsi_state_update(
    payload_str: String,
    pipeline: Arc<CvPipeline>,
    app: tauri::AppHandle,
) {
    // Parse only the field we need (map_slug). Using a projection struct
    // means we don't have to add `Deserialize` to PR 8's `GsiEvent` — the
    // shapes stay decoupled.
    let event: GsiEventProjection = match serde_json::from_str(&payload_str) {
        Ok(e) => e,
        Err(e) => {
            log::warn!(
                "CV: failed to parse gsi:state-update payload: {e}; payload was: {payload_str}"
            );
            return;
        }
    };

    // Detect map change. Read the current state's `current_map` to decide
    // whether to reload calibration; we ONLY reload on actual map change to
    // avoid the per-tick filesystem traffic GSI would otherwise generate.
    let new_map_slug = if event.map_slug.is_empty() {
        None
    } else {
        Some(event.map_slug.clone())
    };

    let current = pipeline.state().snapshot().await.current_map;
    if current == new_map_slug {
        return;
    }

    // Determine the resolution we should calibrate for. PR 9a hardcodes
    // 1920x1080 (the only resolution we ship a bundled calibration for).
    // PR 9b will surface a resolution picker.
    let resolution = "1920x1080";

    let pkg = match &new_map_slug {
        Some(slug) => resolve_calibration(&app, slug, resolution),
        None => None,
    };
    pipeline.set_active(pkg).await;
}

/// Resolve a calibration: operator-edited override first, then bundled.
fn resolve_calibration(
    app: &tauri::AppHandle,
    map_slug: &str,
    resolution: &str,
) -> Option<cv::calibration::MapCalibrationPackage> {
    // Operator override path is the same shape commands.rs writes.
    let dir = app.path().app_config_dir().ok()?.join("cv_calibrations");
    let path = dir.join(format!("{map_slug}_{resolution}.json"));
    if path.exists() {
        if let Ok(contents) = std::fs::read_to_string(&path) {
            if let Ok(pkg) = serde_json::from_str(&contents) {
                return Some(pkg);
            }
        }
    }
    load_bundled_calibration(map_slug, resolution)
}
