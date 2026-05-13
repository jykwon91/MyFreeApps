//! MyGamingAssistant Tauri desktop shell.
//!
//! PR 7 (current): bare shell + smoke-test IPC command.
//! PR 8 will add the CS2 GSI HTTP receiver under `gsi/`.
//! PR 9 will add Windows DXGI screen capture under `capture/` and the
//! minimap CV pipeline under `cv/`.
//!
//! Module boundaries are intentionally drawn so later PRs slot in without
//! re-architecting:
//!   - `commands`  — Tauri IPC commands invoked from the React frontend.
//!   - `gsi`       — CS2 Game State Integration HTTP receiver (PR 8).
//!   - `capture`   — Platform-specific screen capture (PR 9, Windows DXGI).
//!   - `cv`        — Minimap CV / player-position detection (PR 9).

mod commands;

// Placeholder modules — empty in PR 7, populated in later PRs.
// Kept here so future PRs land as additions to existing files / modules
// rather than restructuring the crate. `#[allow(dead_code)]` prevents
// clippy from flagging the empty modules under `-D warnings`.
// Module declarations are ordered alphabetically per `rustfmt`.
#[allow(dead_code)]
mod capture;
#[allow(dead_code)]
mod cv;
#[allow(dead_code)]
mod gsi;

/// Run the Tauri application. Called from `main.rs`.
///
/// Exposed as a library function so the same code path can (in the future)
/// be exercised from integration tests without the `windows_subsystem`
/// attribute getting in the way.
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::get_app_version])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
