//! Shared `CvPipelineState` — mirrors the `GsiState` pattern in
//! `gsi/state.rs`. Stored as `tauri::State<CvPipelineState>` so the IPC
//! commands and the pipeline task share one canonical view.
//!
//! Locking model:
//!   - `inner` is an async `RwLock` — reads dominate (status polling)
//!     and writes are infrequent (tick + map change).
//!   - Same rule as GSI: drop the guard before any `.await`. The tick loop
//!     reads/writes the lock for a few microseconds at a time.

use std::sync::Arc;

use serde::Serialize;
use tokio::sync::RwLock;

/// Read-only snapshot returned by the `cv_status` Tauri command.
///
/// Mirror any field change in `frontend/src/types/desktop.ts`.
#[derive(Debug, Clone, Serialize)]
pub struct CvStatusSnapshot {
    /// `true` when the pipeline tokio task is alive.
    pub running: bool,
    /// `true` when the platform actually has a screen-capture backend. False
    /// on Mac/Linux today; the UI uses this to render a clearer status than
    /// "stopped".
    pub platform_supported: bool,
    /// Map slug the pipeline is currently tracking, or `None` if no GSI map
    /// is active or the map has no calibration.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_map: Option<String>,
    /// Most-recently-detected zone slug, or `None` if the player isn't in
    /// any known zone (or we haven't detected yet).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_zone: Option<String>,
    /// RFC3339 timestamp of the most recent detection, or `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_detection_at: Option<String>,
    /// Cumulative ticks executed.
    pub ticks_total: u64,
    /// Ticks that errored (capture or dot detection failed). Useful for
    /// diagnosing calibration drift.
    pub ticks_errored: u64,
    /// Average tick latency in milliseconds, exponentially-weighted.
    pub avg_tick_ms: f32,
    /// Most-recent single-tick latency in milliseconds.
    pub last_tick_ms: f32,
    /// `true` when the current map has a calibration loaded (bundled or
    /// operator-edited). False when CS2 loaded a map we don't know.
    pub calibration_loaded: bool,
    /// Last error encountered by the pipeline, if any. Reset on next
    /// successful tick.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

/// Inner mutable state, behind the lock.
#[derive(Debug, Default)]
pub struct CvPipelineInner {
    pub running: bool,
    pub platform_supported: bool,
    pub current_map: Option<String>,
    pub last_zone: Option<String>,
    pub last_detection_at: Option<String>,
    pub ticks_total: u64,
    pub ticks_errored: u64,
    pub avg_tick_ms: f32,
    pub last_tick_ms: f32,
    pub calibration_loaded: bool,
    pub last_error: Option<String>,
}

/// Shared state — cheap to clone via the inner `Arc`.
#[derive(Debug, Default, Clone)]
pub struct CvPipelineState {
    pub inner: Arc<RwLock<CvPipelineInner>>,
}

impl CvPipelineState {
    /// Construct an empty state. `platform_supported` is set once at app
    /// startup based on which capture backend compiled in.
    pub fn new(platform_supported: bool) -> Self {
        Self {
            inner: Arc::new(RwLock::new(CvPipelineInner {
                platform_supported,
                ..CvPipelineInner::default()
            })),
        }
    }

    /// Read snapshot for the `cv_status` command.
    pub async fn snapshot(&self) -> CvStatusSnapshot {
        let g = self.inner.read().await;
        CvStatusSnapshot {
            running: g.running,
            platform_supported: g.platform_supported,
            current_map: g.current_map.clone(),
            last_zone: g.last_zone.clone(),
            last_detection_at: g.last_detection_at.clone(),
            ticks_total: g.ticks_total,
            ticks_errored: g.ticks_errored,
            avg_tick_ms: g.avg_tick_ms,
            last_tick_ms: g.last_tick_ms,
            calibration_loaded: g.calibration_loaded,
            last_error: g.last_error.clone(),
        }
    }

    pub async fn mark_running(&self, running: bool) {
        let mut g = self.inner.write().await;
        g.running = running;
    }

    /// Set the current map + whether a calibration was found for it. Called
    /// on GSI map-change events.
    pub async fn set_current_map(&self, map_slug: Option<String>, calibration_loaded: bool) {
        let mut g = self.inner.write().await;
        g.current_map = map_slug;
        g.calibration_loaded = calibration_loaded;
        // Reset last-zone when we switch maps — old data isn't meaningful.
        g.last_zone = None;
    }

    /// Record one tick. `tick_ms` is the wall-clock duration; `zone_slug` is
    /// the freshly-detected zone (or None for "no detection this tick").
    /// `is_error` flags ticks where capture or dot-detect failed.
    pub async fn record_tick(
        &self,
        tick_ms: f32,
        zone_slug: Option<String>,
        detection_at: Option<String>,
        is_error: bool,
        error_message: Option<String>,
    ) {
        let mut g = self.inner.write().await;
        g.ticks_total = g.ticks_total.saturating_add(1);
        if is_error {
            g.ticks_errored = g.ticks_errored.saturating_add(1);
        }
        // EMA with alpha=0.1 — fast enough to track a 100ms regression
        // within a second of tick history.
        const ALPHA: f32 = 0.1;
        if g.avg_tick_ms == 0.0 {
            g.avg_tick_ms = tick_ms;
        } else {
            g.avg_tick_ms = ALPHA * tick_ms + (1.0 - ALPHA) * g.avg_tick_ms;
        }
        g.last_tick_ms = tick_ms;
        if !is_error {
            // Don't replace last_zone on a tick that errored — the previous
            // detection is still our best guess for where the player is.
            // Only update when we have a fresh detection or an explicit "no
            // detection" result.
            if let Some(at) = detection_at {
                g.last_detection_at = Some(at);
            }
            if let Some(z) = zone_slug {
                g.last_zone = Some(z);
            }
            g.last_error = None;
        } else {
            g.last_error = error_message;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn snapshot_reflects_defaults() {
        let s = CvPipelineState::new(true);
        let snap = s.snapshot().await;
        assert!(snap.platform_supported);
        assert!(!snap.running);
        assert_eq!(snap.ticks_total, 0);
        assert!(snap.current_map.is_none());
    }

    #[tokio::test]
    async fn mark_running_toggles() {
        let s = CvPipelineState::new(true);
        s.mark_running(true).await;
        assert!(s.snapshot().await.running);
        s.mark_running(false).await;
        assert!(!s.snapshot().await.running);
    }

    #[tokio::test]
    async fn set_current_map_resets_last_zone() {
        let s = CvPipelineState::new(true);
        // Pretend we detected B Site on Mirage.
        s.set_current_map(Some("mirage".into()), true).await;
        s.record_tick(
            10.0,
            Some("b-site".into()),
            Some("2026-05-13T10:00:00Z".into()),
            false,
            None,
        )
        .await;
        assert_eq!(s.snapshot().await.last_zone.as_deref(), Some("b-site"));

        // Map changes to Inferno — last_zone must reset (old detection
        // wouldn't make sense on the new map).
        s.set_current_map(Some("inferno".into()), false).await;
        let snap = s.snapshot().await;
        assert_eq!(snap.current_map.as_deref(), Some("inferno"));
        assert!(snap.last_zone.is_none());
        assert!(!snap.calibration_loaded);
    }

    #[tokio::test]
    async fn record_tick_updates_counters_and_ema() {
        let s = CvPipelineState::new(true);
        s.record_tick(10.0, Some("a-site".into()), Some("t1".into()), false, None)
            .await;
        s.record_tick(20.0, Some("a-site".into()), Some("t2".into()), false, None)
            .await;
        let snap = s.snapshot().await;
        assert_eq!(snap.ticks_total, 2);
        assert!((snap.last_tick_ms - 20.0).abs() < 1e-6);
        // EMA from 10 (initial) → 10*0.9 + 20*0.1 = 11.0
        assert!((snap.avg_tick_ms - 11.0).abs() < 0.01);
    }

    #[tokio::test]
    async fn errored_tick_increments_error_counter_and_preserves_last_zone() {
        let s = CvPipelineState::new(true);
        s.record_tick(10.0, Some("a-site".into()), Some("t1".into()), false, None)
            .await;
        s.record_tick(20.0, None, None, true, Some("capture failed".into()))
            .await;
        let snap = s.snapshot().await;
        assert_eq!(snap.ticks_total, 2);
        assert_eq!(snap.ticks_errored, 1);
        assert_eq!(snap.last_zone.as_deref(), Some("a-site"));
        assert_eq!(snap.last_error.as_deref(), Some("capture failed"));
    }
}
