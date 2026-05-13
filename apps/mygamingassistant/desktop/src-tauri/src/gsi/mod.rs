//! CS2 Game State Integration (GSI) receiver.
//!
//! **Empty in PR 7.** Populated in PR 8.
//!
//! Planned shape (PR 8):
//!   - An `axum`-based HTTP server bound to `127.0.0.1:<port>` (port chosen
//!     by the OS, persisted to a config file so the GSI cfg can match).
//!   - A `/gsi` POST endpoint that accepts the JSON payload CS2 sends every
//!     tick during a match: map name, player team (T/CT), round phase,
//!     money, weapons + utility in inventory.
//!   - A `Result<GsiState>` channel published to the Tauri app handle so
//!     the frontend can subscribe via `event::listen()`.
//!   - A `cs2_install_gsi_config` command that writes the GSI config file
//!     into the user's CS2 `cfg/` directory on first launch (with consent).
//!
//! Lifecycle: started during `tauri::Builder::default().setup()` once the
//! main window is ready. Stopped on app exit via `RunEvent::Exit`.

// PR 8 will replace this with the real GSI server. Keep the module here so
// `mod gsi;` in lib.rs compiles cleanly today.
