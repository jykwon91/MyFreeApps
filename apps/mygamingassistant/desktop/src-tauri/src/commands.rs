//! Tauri IPC commands.
//!
//! PR 7 ships only `get_app_version` — a build-time smoke test that confirms
//! the IPC bridge between the React frontend and the Rust backend works on
//! all three target platforms (Linux, macOS, Windows).
//!
//! Future PRs will add commands here:
//!   - PR 8: `gsi_status`, `cs2_install_gsi_config`
//!   - PR 9: `capture_minimap`, `calibrate_minimap`
//!   - PR 10: `live_mode_start`, `live_mode_stop`

use serde::Serialize;

/// Application version + build metadata returned by `get_app_version`.
///
/// `version` mirrors the `version` field in `tauri.conf.json`, which in turn
/// mirrors the crate's `Cargo.toml` `[package].version`. Keep them in sync.
#[derive(Debug, Serialize)]
pub struct AppVersion {
    /// Semver of the desktop binary (matches `Cargo.toml` `[package].version`).
    pub version: String,
    /// One of "debug", "release". Frontend uses this to gate developer affordances.
    pub build: &'static str,
    /// PR sequence number this version corresponds to. Useful while building out
    /// PRs 7-12; can be removed once the app is in steady-state.
    pub pr: u8,
}

/// Smoke-test command — returns the current desktop app version.
///
/// Invoked from the frontend as:
///
/// ```ts
/// import { invoke } from "@tauri-apps/api/core";
/// const v = await invoke<AppVersion>("get_app_version");
/// ```
///
/// If this command works on all three CI platforms, the IPC bridge is wired
/// correctly and we can build out real commands in PR 8+.
#[tauri::command]
pub fn get_app_version() -> AppVersion {
    AppVersion {
        version: env!("CARGO_PKG_VERSION").to_string(),
        #[cfg(debug_assertions)]
        build: "debug",
        #[cfg(not(debug_assertions))]
        build: "release",
        pr: 7,
    }
}
