//! Tauri IPC commands for the CS2 GSI receiver.
//!
//! Exposed to the frontend via `invoke("...")` from `lib/tauri.ts`:
//!
//!   - `gsi_server_status`        → returns the current `ServerStatusSnapshot`.
//!   - `install_cs2_gsi_config`   → writes the cfg file into CS2's cfg dir.
//!   - `uninstall_cs2_gsi_config` → removes the cfg file.
//!   - `start_gsi_server`         → no-op today; auto-started at setup.
//!   - `stop_gsi_server`          → no-op today; lives for app lifetime.
//!
//! The start/stop commands are placeholders for PR 10 / 12 — they exist so
//! the frontend's "Test connection" UI can pretend to lifecycle-control
//! the receiver without needing app restart UX. We mark them with the
//! `#[allow(...)]` attribute on the inner no-op to flag them as expected.

use tauri::State;

use crate::gsi::{
    installer::{install_gsi_cfg, uninstall_gsi_cfg, InstallResult, UninstallResult},
    state::{GsiState, ServerStatusSnapshot},
};

/// Returns the current receiver status. Cheap; safe to poll at 1Hz from
/// the setup UI without measurable overhead.
#[tauri::command]
pub async fn gsi_server_status(state: State<'_, GsiState>) -> Result<ServerStatusSnapshot, String> {
    Ok(state.snapshot().await)
}

/// Install the GSI cfg into CS2's cfg directory.
///
/// `custom_path` is optional. Pass `None` (or `null` from JS) to use the
/// OS-default path; pass a string when the operator has CS2 in a non-default
/// Steam library.
#[tauri::command]
pub async fn install_cs2_gsi_config(
    custom_path: Option<String>,
    state: State<'_, GsiState>,
) -> Result<InstallResult, String> {
    let snap = state.snapshot().await;
    let auth_token = state.auth_token().await;

    if auth_token.is_empty() {
        return Ok(InstallResult {
            installed: false,
            path: String::new(),
            error: Some(
                "Auth token has not been initialized. Restart the app — \
                 this is a setup bug, please report."
                    .to_string(),
            ),
        });
    }

    Ok(install_gsi_cfg(
        custom_path.as_deref(),
        snap.port,
        &auth_token,
    ))
}

/// Remove the previously-installed GSI cfg.
#[tauri::command]
pub async fn uninstall_cs2_gsi_config(
    custom_path: Option<String>,
) -> Result<UninstallResult, String> {
    Ok(uninstall_gsi_cfg(custom_path.as_deref()))
}

/// Placeholder — receiver auto-starts at app launch. Reserved for future
/// "pause receiver" feature.
#[tauri::command]
pub async fn start_gsi_server(_state: State<'_, GsiState>) -> Result<(), String> {
    // No-op today. PR 10/12 may add an explicit lifecycle.
    Ok(())
}

/// Placeholder — receiver runs for the app's lifetime.
#[tauri::command]
pub async fn stop_gsi_server(_state: State<'_, GsiState>) -> Result<(), String> {
    Ok(())
}
