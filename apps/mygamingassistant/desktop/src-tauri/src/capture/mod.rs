//! Platform-specific screen capture.
//!
//! **Empty in PR 7.** Populated in PR 9.
//!
//! Planned shape (PR 9):
//!   - Windows path: `windows` crate + DXGI Desktop Duplication API for
//!     low-overhead capture of the minimap region. Gated behind
//!     `#[cfg(windows)]`.
//!   - macOS path: `screencapturekit` (deferred — PR 11 if Valorant on Mac
//!     becomes a goal). Stub today.
//!   - Linux path: `pipewire` / X11 `xcb` (deferred — same).
//!
//! Capture cadence: 4-10 Hz. Frame goes straight to the `cv` module without
//! ever touching the JS bundle (zero IPC overhead per frame).

// PR 9 will replace this with the real capture pipeline.
