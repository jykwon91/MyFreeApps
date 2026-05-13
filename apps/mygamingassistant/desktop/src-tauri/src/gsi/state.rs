//! Shared `GsiState` — wraps everything the receiver needs to share across
//! the Tauri command handlers and the axum request handler.
//!
//! Stored as `tauri::State<GsiState>` so commands can pull it via the Tauri
//! managed-state API.
//!
//! Locking model:
//!   - `inner` is an async `RwLock` — reads dominate (status polling) and
//!     writes are infrequent (install, payload arrival).
//!   - Hold the lock for as little time as possible. The HTTP handler
//!     `clone()`s the `app_handle` out of the lock and drops the guard
//!     before emitting the Tauri event, so `app.emit()` doesn't hold the
//!     lock during the IPC roundtrip.

use std::sync::Arc;

use serde::Serialize;
use tokio::sync::RwLock;

use crate::gsi::installer::DEFAULT_GSI_PORT;

/// Read-only snapshot of the receiver's state, returned by the
/// `gsi_server_status` Tauri command.
///
/// **Stability contract**: this shape is part of the IPC API. Mirror any
/// change in `frontend/src/types/desktop.ts`.
#[derive(Debug, Clone, Serialize)]
pub struct ServerStatusSnapshot {
    /// `true` when the axum listener is bound and accepting payloads.
    pub running: bool,
    /// Port the listener is bound to. Always populated whether `running` or
    /// not (so the UI can show "should be running on :8765" even during
    /// boot).
    pub port: u16,
    /// Cumulative count of accepted payloads since the receiver started.
    /// Doesn't include 401 / malformed rejects.
    pub payloads_received: u64,
    /// ISO-8601 timestamp of the most recent accepted payload. `None` until
    /// CS2 connects for the first time.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_event_at: Option<String>,
    /// `true` if the auth token was loaded (or freshly generated) on boot.
    /// Helps the UI explain why a cfg install would land before the user
    /// has clicked "Install".
    pub auth_token_loaded: bool,
}

/// Inner mutable state. Behind the lock.
#[derive(Debug)]
pub struct GsiStateInner {
    /// Port the listener is bound on.
    pub port: u16,
    /// `true` once axum's `Server::serve` has begun accepting.
    pub running: bool,
    /// Shared secret that incoming payloads must match. Generated once per
    /// install and persisted to disk.
    pub auth_token: String,
    /// True when `auth_token` was loaded from disk (not just defaulted).
    pub auth_token_loaded: bool,
    pub payloads_received: u64,
    pub last_event_at: Option<String>,
}

impl Default for GsiStateInner {
    fn default() -> Self {
        Self {
            port: DEFAULT_GSI_PORT,
            running: false,
            auth_token: String::new(),
            auth_token_loaded: false,
            payloads_received: 0,
            last_event_at: None,
        }
    }
}

/// The shared receiver state. Cheap to clone (`Arc<RwLock<...>>`).
#[derive(Debug, Default, Clone)]
pub struct GsiState {
    pub inner: Arc<RwLock<GsiStateInner>>,
}

impl GsiState {
    /// Construct an empty state and seed the auth token. Called once at
    /// `tauri::Builder::setup` time.
    ///
    /// Synchronous because Tauri's setup closure runs outside any tokio
    /// runtime; using `blocking_write` would panic if a future caller
    /// invokes us from inside the runtime. We construct the inner
    /// `GsiStateInner` directly and wrap it after — no lock needed.
    pub fn new(auth_token: String, auth_token_loaded: bool) -> Self {
        Self {
            inner: Arc::new(RwLock::new(GsiStateInner {
                auth_token,
                auth_token_loaded,
                ..GsiStateInner::default()
            })),
        }
    }

    /// Read snapshot. Cheap; bounded by reader lock contention.
    pub async fn snapshot(&self) -> ServerStatusSnapshot {
        let g = self.inner.read().await;
        ServerStatusSnapshot {
            running: g.running,
            port: g.port,
            payloads_received: g.payloads_received,
            last_event_at: g.last_event_at.clone(),
            auth_token_loaded: g.auth_token_loaded,
        }
    }

    /// Read-only auth-token getter for the HTTP handler. Returns owned
    /// `String` so the lock can release immediately.
    pub async fn auth_token(&self) -> String {
        self.inner.read().await.auth_token.clone()
    }

    /// Mark the server as running and bound on `port`. Called once after
    /// `TcpListener::bind` succeeds.
    pub async fn mark_running(&self, port: u16) {
        let mut g = self.inner.write().await;
        g.running = true;
        g.port = port;
    }

    /// Mark the server as stopped. Called from `stop_gsi_server` (which
    /// today is a placeholder — we don't ship a graceful shutdown path for
    /// PR 8; the receiver lives for the app's lifetime).
    pub async fn mark_stopped(&self) {
        let mut g = self.inner.write().await;
        g.running = false;
    }

    /// Bump the accepted-payload counter and update `last_event_at`.
    pub async fn record_event(&self, received_at: String) {
        let mut g = self.inner.write().await;
        g.payloads_received = g.payloads_received.saturating_add(1);
        g.last_event_at = Some(received_at);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn record_event_increments_count_and_updates_timestamp() {
        let state = GsiState::new("tok".into(), true);

        let pre = state.snapshot().await;
        assert_eq!(pre.payloads_received, 0);
        assert_eq!(pre.last_event_at, None);

        state.record_event("2026-05-13T10:00:00Z".into()).await;
        state.record_event("2026-05-13T10:00:01Z".into()).await;

        let post = state.snapshot().await;
        assert_eq!(post.payloads_received, 2);
        assert_eq!(post.last_event_at.as_deref(), Some("2026-05-13T10:00:01Z"));
    }

    #[tokio::test]
    async fn mark_running_and_stopped_toggle_flag() {
        let state = GsiState::new("tok".into(), true);
        state.mark_running(8765).await;
        assert!(state.snapshot().await.running);
        assert_eq!(state.snapshot().await.port, 8765);

        state.mark_stopped().await;
        assert!(!state.snapshot().await.running);
    }

    #[tokio::test]
    async fn auth_token_round_trip() {
        let state = GsiState::new("secret".into(), true);
        assert_eq!(state.auth_token().await, "secret");
        assert!(state.snapshot().await.auth_token_loaded);
    }
}
