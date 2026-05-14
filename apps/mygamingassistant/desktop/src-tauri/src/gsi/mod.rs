//! CS2 Game State Integration (GSI) receiver — PR 8/12.
//!
//! Architecture:
//!
//! ```text
//!   CS2 game client
//!         │  (POST JSON every ~100ms while CS2 is running)
//!         ▼
//!   HTTP listener on 127.0.0.1:8765
//!         │  ── validate auth.token against the per-install secret
//!         │  ── parse into `RawGsiPayload`
//!         │  ── normalize into `GsiEvent` (side=side_a/side_b/any, map slug stripped)
//!         ▼
//!   `app.emit("gsi:state-update", GsiEvent)`
//!         │
//!         ▼
//!   Frontend `useGsiState()` re-renders Live mode top bar + lineup strip.
//! ```
//!
//! Lifecycle:
//!   - HTTP server starts during `tauri::Builder::default().setup(...)` and
//!     keeps running for the lifetime of the app.
//!   - Auth token is persisted to `<app-config-dir>/cs2_gsi_auth_token` on
//!     first install; reused on subsequent boots.
//!   - The same token is written into CS2's `gamestate_integration_*.cfg`,
//!     so even if a hostile process discovers port 8765, it can't post valid
//!     payloads without reading the operator's user-scoped config file.
//!
//! Module layout:
//!   - `payload`    — Raw CS2 JSON shape + normalized event for the frontend.
//!   - `installer`  — `install_cs2_gsi_config` + Steam cfg-path detection.
//!   - `server`     — axum router, port binding, request handler.
//!   - `state`      — Shared `ServerState` (auth token, status counters).
//!   - `commands`   — Tauri IPC entry points (`gsi_server_status`, etc.).
//!   - `weapons`    — CS2 weapon-slug → MGA utility-type-slug mapping
//!     (PR 10). Drives the live utility-held lineup filter.

pub mod commands;
pub mod installer;
pub mod payload;
pub mod server;
pub mod state;
pub mod weapons;

// NOTE: we intentionally do NOT re-export the `#[tauri::command]` functions
// at this module level. Re-exporting via `pub use commands::*` looks like
// it works, but the `tauri::generate_handler!` macro looks for hidden
// companion items (`__cmd__<name>` + `__tauri_command_name_<name>`) in the
// SAME module path as the function. Re-exports don't carry those companions
// along — the macro then fails with `cannot find `__cmd__...` in `gsi``.
//
// Always reference Tauri commands at their canonical path:
//   `gsi::commands::install_cs2_gsi_config`
// not the shortcut `gsi::install_cs2_gsi_config`.
