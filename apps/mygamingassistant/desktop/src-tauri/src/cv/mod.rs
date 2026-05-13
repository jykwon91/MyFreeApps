//! Computer vision pipeline.
//!
//! **Empty in PR 7.** Populated in PR 9 (player-dot detection on minimap)
//! and PR 11 (Valorant minimap template matching + side-UI region detection).
//!
//! Planned shape (PR 9):
//!   - `opencv` crate (binds to OpenCV 4.x).
//!   - Input: a captured minimap frame from `crate::capture`.
//!   - Detect player dot via template match (CS2 dot color = green/yellow,
//!     known shape, fixed-size search window).
//!   - Map dot pixel → `MapZone` slug using the per-map calibration JSON
//!     stored on the backend.
//!   - Publish detected zone to the Tauri app handle for the frontend to
//!     consume via event.

// PR 9 will replace this with the real CV pipeline.
