//! Minimap CV pipeline (PR 9a).
//!
//! Pipeline shape, end to end:
//!
//! ```text
//!   GSI event (gsi:state-update) — fires the moment CS2 loads a map
//!        │   map_slug=mirage
//!        ▼
//!   CvPipeline::on_map_change("mirage")
//!        │   loads MinimapCalibration + ZonePolygons for the map
//!        ▼
//!   tokio task ticks at 20 Hz:
//!        ┌─────────────────────────────────────────────┐
//!        │ 1. ScreenCapturer.capture_region(minimap)   │  <8 ms
//!        │ 2. dot_detector::detect_player_dot          │  <8 ms
//!        │ 3. calibration.minimap_pixel_to_world       │  ~0 ms
//!        │ 4. polygon::find_zone                       │  ~0 ms
//!        │ 5. emit cv:zone-detected if zone changed    │  IPC
//!        └─────────────────────────────────────────────┘
//!        Total < 16 ms (60 Hz headroom, even though we tick at 20 Hz).
//!
//!   Frontend listens to `cv:zone-detected`:
//!   - LiveTopBar shows "Mirage · CT · B Site · live"
//!   - Lineup strip filter narrows to (map, side, zone)
//! ```
//!
//! Library choice (do not revisit lightly):
//!   - Pure-Rust `image` + `imageproc`. NOT `opencv-rust` — see the comment
//!     in Cargo.toml and `project_mygamingassistant_plan.md` for the
//!     rationale (~200MB OpenCV install, breaks reproducible CI builds).
//!   - Color-based blob detection is ~200 LOC; we don't need contour
//!     matching or optical flow.
//!
//! Module layout:
//!   - `calibration` — `MinimapCalibration` value type + affine transform.
//!   - `commands`    — Tauri IPC commands (`cv_start`, `cv_status`, etc.).
//!   - `dot_detector`— player-dot detection (color threshold + CC + centroid).
//!   - `pipeline`    — orchestrator; spawns the tokio task.
//!   - `polygon`     — point-in-polygon (ray casting).
//!   - `state`       — shared `CvPipelineState` mirroring the GSI pattern.

pub mod calibration;
pub mod commands;
pub mod dot_detector;
pub mod pipeline;
pub mod polygon;
pub mod state;

// Bundled-default helper. Lives in `calibration::bundled` to keep this index
// thin. Reexported here for convenience.
pub use calibration::bundled::load_bundled_calibration;
