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

pub mod commands;
pub mod installer;
pub mod payload;
pub mod server;
pub mod state;

pub use commands::{
    gsi_server_status, install_cs2_gsi_config, start_gsi_server, stop_gsi_server,
    uninstall_cs2_gsi_config,
};
pub use state::GsiState;
