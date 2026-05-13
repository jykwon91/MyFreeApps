//! axum HTTP receiver for CS2 GSI POSTs.
//!
//! Surface:
//!   - `POST /gsi` — CS2 sends GSI payload here.
//!   - `GET  /healthz` — liveness probe (used by tests + setup UI).
//!
//! Security model:
//!   - Bound to `127.0.0.1` only. No external surface.
//!   - Every payload must contain a top-level `auth.token` matching the
//!     in-memory token. Mismatched / missing tokens → 401 with no payload.
//!   - We log mismatches at `warn!` with a fingerprint of the incoming
//!     token's first 4 chars so the operator can spot misconfiguration
//!     without leaking the value into logs.
//!
//! Event emission:
//!   The receiver emits two events when the operator's frontend is listening:
//!     - `gsi:state-update`   — normalized `GsiEvent` on every accepted POST.
//!     - `gsi:server-status`  — snapshot pushed on startup and on each
//!                              payload (frontend can poll OR subscribe).
//!   `EventEmitter` is a trait so tests can mount the router against a
//!   stub emitter; production uses the `tauri::AppHandle` impl below.

use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::sync::Arc;

use axum::{
    extract::{Json, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use tauri::{AppHandle, Emitter};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

use crate::gsi::{
    payload::{normalize_payload, GsiEvent, RawGsiPayload},
    state::{GsiState, ServerStatusSnapshot},
};

/// Tauri event name emitted on every accepted GSI payload.
pub const EVENT_STATE_UPDATE: &str = "gsi:state-update";
/// Tauri event name emitted on server-status changes (start / each payload).
pub const EVENT_SERVER_STATUS: &str = "gsi:server-status";

/// Abstraction over Tauri's `app.emit()` so tests can mount the router
/// without a Tauri runtime. Errors are absorbed into a `String` so the
/// implementation can be backed by either Tauri (which returns its own
/// error type) or a test sink.
pub trait EventEmitter: Send + Sync + 'static {
    fn emit_state_update(&self, event: &GsiEvent) -> Result<(), String>;
    fn emit_server_status(&self, status: &ServerStatusSnapshot) -> Result<(), String>;
}

/// Production impl backed by Tauri's `AppHandle`.
#[derive(Clone)]
pub struct TauriEmitter {
    pub app_handle: AppHandle,
}

impl EventEmitter for TauriEmitter {
    fn emit_state_update(&self, event: &GsiEvent) -> Result<(), String> {
        self.app_handle
            .emit(EVENT_STATE_UPDATE, event)
            .map_err(|e| e.to_string())
    }
    fn emit_server_status(&self, status: &ServerStatusSnapshot) -> Result<(), String> {
        self.app_handle
            .emit(EVENT_SERVER_STATUS, status)
            .map_err(|e| e.to_string())
    }
}

/// State threaded through axum handlers.
#[derive(Clone)]
struct AppState {
    gsi: GsiState,
    emitter: Arc<dyn EventEmitter>,
}

/// Build the axum router. Extracted so tests can mount it without the full
/// Tauri lifecycle.
pub fn build_router(gsi: GsiState, emitter: Arc<dyn EventEmitter>) -> Router {
    let app_state = AppState { gsi, emitter };
    Router::new()
        .route("/gsi", post(handle_gsi_post))
        .route("/healthz", get(handle_healthz))
        .with_state(app_state)
}

/// Bind + serve on `127.0.0.1:port`. Spawn this from `tauri::Builder::setup`
/// via `tokio::spawn`.
pub async fn run_server(
    gsi: GsiState,
    app_handle: AppHandle,
    port: u16,
) -> Result<(), std::io::Error> {
    let emitter: Arc<dyn EventEmitter> = Arc::new(TauriEmitter { app_handle });
    run_server_with_emitter(gsi, emitter, port).await
}

/// Test-friendly server entry. Production calls `run_server`; tests call
/// this with their own emitter.
pub async fn run_server_with_emitter(
    gsi: GsiState,
    emitter: Arc<dyn EventEmitter>,
    port: u16,
) -> Result<(), std::io::Error> {
    let addr = SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port));
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            log::error!(
                "GSI HTTP server failed to bind addr={} kind={:?} message={}",
                addr,
                e.kind(),
                e,
            );
            return Err(e);
        }
    };
    log::info!("GSI HTTP server bound to {addr}");

    gsi.mark_running(port).await;

    // Emit an initial status event so the frontend can flip from "starting"
    // to "ready" without polling.
    let snap = gsi.snapshot().await;
    let _ = emitter.emit_server_status(&snap);

    let router = build_router(gsi.clone(), emitter);
    axum::serve(listener, router).await
}

/// `GET /healthz` — used by setup UI to probe that the server bound
/// successfully without needing CS2 to POST first.
async fn handle_healthz() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

/// `POST /gsi` — CS2 posts game state here every tick.
async fn handle_gsi_post(
    State(app_state): State<AppState>,
    Json(raw): Json<RawGsiPayload>,
) -> impl IntoResponse {
    let expected_token = app_state.gsi.auth_token().await;
    let provided_token = raw
        .auth
        .as_ref()
        .and_then(|a| a.token.clone())
        .unwrap_or_default();

    if !ct_eq(provided_token.as_bytes(), expected_token.as_bytes()) {
        // Fingerprint the provided token (first 4 chars) so a misconfigured
        // cfg surfaces without leaking the real value.
        let fingerprint: String = provided_token.chars().take(4).collect();
        log::warn!(
            "GSI POST rejected: bad auth token (provided_prefix={}, expected_present={})",
            if fingerprint.is_empty() { "<empty>" } else { &fingerprint },
            !expected_token.is_empty(),
        );
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }

    // Format the receive-time as RFC3339 (ISO-8601 subset). UTC.
    let received_at = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| String::from("1970-01-01T00:00:00Z"));

    let event: GsiEvent = normalize_payload(&raw, received_at.clone());

    // Update counters BEFORE emit so the snapshot reflects the new payload.
    app_state.gsi.record_event(received_at).await;

    if let Err(e) = app_state.emitter.emit_state_update(&event) {
        log::warn!("Failed to emit gsi:state-update event: {e}");
    }

    let snap = app_state.gsi.snapshot().await;
    let _ = app_state.emitter.emit_server_status(&snap);

    (StatusCode::OK, "ok").into_response()
}

/// Constant-time byte comparison. Returns `false` for differing lengths
/// without short-circuiting on the early bytes.
fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Test-only stub emitter that records events into an in-memory log.
///
/// Visible to integration tests under `tests/` via the `pub` qualifier.
/// Not used in production but kept in the lib crate (not gated by `cfg(test)`)
/// because integration tests are a separate crate that can't see `cfg(test)`
/// items from the library.
#[derive(Debug, Default)]
pub struct StubEmitter {
    pub state_updates: std::sync::Mutex<Vec<GsiEvent>>,
    pub server_statuses: std::sync::Mutex<Vec<ServerStatusSnapshot>>,
}

impl EventEmitter for StubEmitter {
    fn emit_state_update(&self, event: &GsiEvent) -> Result<(), String> {
        self.state_updates
            .lock()
            .map_err(|e| e.to_string())?
            .push(event.clone());
        Ok(())
    }
    fn emit_server_status(&self, status: &ServerStatusSnapshot) -> Result<(), String> {
        self.server_statuses
            .lock()
            .map_err(|e| e.to_string())?
            .push(status.clone());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ct_eq_returns_true_for_identical_bytes() {
        assert!(ct_eq(b"hello", b"hello"));
    }

    #[test]
    fn ct_eq_returns_false_for_different_bytes() {
        assert!(!ct_eq(b"hello", b"world"));
    }

    #[test]
    fn ct_eq_returns_false_for_different_lengths() {
        assert!(!ct_eq(b"hi", b"hello"));
        assert!(!ct_eq(b"", b"x"));
    }

    #[test]
    fn ct_eq_returns_true_for_empty_pair() {
        assert!(ct_eq(b"", b""));
    }

    /// Smoke test: pass a complete fixture payload through `build_router`
    /// using `axum::Router::oneshot` (no TCP bind needed).
    #[tokio::test]
    async fn router_accepts_valid_payload_emits_event() {
        use axum::body::Body;
        use axum::http::Request;
        use tower::ServiceExt;

        let gsi = GsiState::new("test-token".into(), true);
        let stub = Arc::new(StubEmitter::default());
        let emitter: Arc<dyn EventEmitter> = stub.clone();

        let router = build_router(gsi.clone(), emitter);

        let body = serde_json::json!({
            "map": {"name": "de_mirage", "phase": "live"},
            "player": {"team": "T", "activity": "playing"},
            "round": {"phase": "live"},
            "auth": {"token": "test-token"}
        });

        let req = Request::builder()
            .method("POST")
            .uri("/gsi")
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();

        let resp = router.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        // Emitter should have received exactly one state update with the
        // normalized fields.
        let updates = stub.state_updates.lock().unwrap();
        assert_eq!(updates.len(), 1);
        let event = &updates[0];
        assert_eq!(event.map_slug, "mirage");
        assert_eq!(event.activity, "playing");
        // GsiState should have logged the event.
        let snap = gsi.snapshot().await;
        assert_eq!(snap.payloads_received, 1);
        assert!(snap.last_event_at.is_some());
    }

    #[tokio::test]
    async fn router_rejects_bad_auth_token() {
        use axum::body::Body;
        use axum::http::Request;
        use tower::ServiceExt;

        let gsi = GsiState::new("correct-token".into(), true);
        let stub = Arc::new(StubEmitter::default());
        let emitter: Arc<dyn EventEmitter> = stub.clone();
        let router = build_router(gsi.clone(), emitter);

        let body = serde_json::json!({
            "map": {"name": "de_mirage", "phase": "live"},
            "player": {"team": "T"},
            "auth": {"token": "WRONG"}
        });

        let req = Request::builder()
            .method("POST")
            .uri("/gsi")
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();

        let resp = router.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);

        // No event should be emitted on rejection.
        assert_eq!(stub.state_updates.lock().unwrap().len(), 0);
        let snap = gsi.snapshot().await;
        assert_eq!(snap.payloads_received, 0);
    }

    #[tokio::test]
    async fn router_rejects_missing_auth_token() {
        use axum::body::Body;
        use axum::http::Request;
        use tower::ServiceExt;

        let gsi = GsiState::new("correct-token".into(), true);
        let emitter: Arc<dyn EventEmitter> = Arc::new(StubEmitter::default());
        let router = build_router(gsi, emitter);

        // No "auth" block at all
        let body = serde_json::json!({
            "map": {"name": "de_mirage", "phase": "live"},
            "player": {"team": "T"}
        });

        let req = Request::builder()
            .method("POST")
            .uri("/gsi")
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();

        let resp = router.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn healthz_returns_ok() {
        use axum::body::Body;
        use axum::http::Request;
        use tower::ServiceExt;

        let gsi = GsiState::new("t".into(), true);
        let emitter: Arc<dyn EventEmitter> = Arc::new(StubEmitter::default());
        let router = build_router(gsi, emitter);

        let req = Request::builder()
            .method("GET")
            .uri("/healthz")
            .body(Body::empty())
            .unwrap();

        let resp = router.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
    }
}
