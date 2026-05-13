//! MyGamingAssistant Tauri desktop shell.
//!
//! PR 7: bare shell + smoke-test IPC command (`get_app_version`).
//! PR 8 (this PR): CS2 GSI HTTP receiver — see `gsi/`.
//! PR 9 will add Windows DXGI screen capture under `capture/` and the
//! minimap CV pipeline under `cv/`.
//!
//! Module boundaries are intentionally drawn so later PRs slot in without
//! re-architecting:
//!   - `commands`  — Tauri IPC commands invoked from the React frontend.
//!   - `gsi`       — CS2 Game State Integration HTTP receiver (PR 8).
//!   - `capture`   — Platform-specific screen capture (PR 9, Windows DXGI).
//!   - `cv`        — Minimap CV / player-position detection (PR 9).
//!
//! GSI receiver lifecycle (PR 8):
//!   1. At `tauri::Builder::setup`, we load (or generate) the per-install
//!      auth token from `<app_config_dir>/cs2_gsi_auth_token`.
//!   2. We register a `GsiState` Tauri-managed state so all commands and
//!      the axum handler can share it.
//!   3. We `tokio::spawn(run_server(...))` on the Tauri-owned tokio runtime.
//!   4. On every accepted POST, the axum handler emits `gsi:state-update`
//!      and `gsi:server-status` events that the frontend subscribes to.

mod commands;

// Placeholder modules — empty in PR 7, populated in later PRs.
// `#[allow(dead_code)]` prevents clippy from flagging empty modules under
// `-D warnings`. Module declarations are ordered alphabetically per `rustfmt`.
#[allow(dead_code)]
mod capture;
#[allow(dead_code)]
mod cv;
// `pub` so integration tests under `tests/` can construct GsiState +
// drive the axum router directly. Internal callers reach in via the
// re-exports inside `gsi/mod.rs`.
pub mod gsi;

use std::path::Path;

use tauri::Manager;

use crate::gsi::{
    installer::{auth_token_path, DEFAULT_GSI_PORT},
    server::run_server,
    state::GsiState,
};

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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
