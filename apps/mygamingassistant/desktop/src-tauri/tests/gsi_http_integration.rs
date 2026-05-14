//! End-to-end integration test for the CS2 GSI HTTP receiver.
//!
//! Spins up the axum server on a bound-to-zero loopback port, sends a
//! fixture POST via reqwest, asserts the receiver:
//!   1. Accepts the payload (200 OK)
//!   2. Updates the in-memory `GsiState` counters
//!   3. Emits a state-update event via the injected `EventEmitter`
//!
//! Rejection path is covered by the in-crate unit tests in
//! `src/gsi/server.rs` via `tower::ServiceExt::oneshot`. This integration
//! test specifically exercises the TCP-bind + tokio::serve path that
//! production uses.

use std::sync::Arc;

use mygamingassistant_lib::gsi::{
    server::{run_server_with_emitter, EventEmitter, StubEmitter},
    state::GsiState,
};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn live_http_receiver_accepts_real_post() {
    // Auth token used in both the GsiState and the test POST.
    let token = "test-token-integration";

    let gsi = GsiState::new(token.into(), true);
    let stub = Arc::new(StubEmitter::default());
    let emitter: Arc<dyn EventEmitter> = stub.clone();

    // Bind to a port we know is free in CI. Use the well-known testing
    // pattern of asking the OS for a port via `:0`-binding: bind a
    // throwaway `TcpListener` to `127.0.0.1:0`, read the assigned port,
    // drop it. Race window exists but is acceptable for a single test
    // here.
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).expect("bind probe");
    let port = listener.local_addr().expect("local_addr").port();
    drop(listener);

    // Spawn the server in the background.
    let gsi_clone = gsi.clone();
    let server_handle = tokio::spawn(async move {
        let _ = run_server_with_emitter(gsi_clone, emitter, port).await;
    });

    // Poll /healthz until ready. axum starts almost instantly but on slow
    // CI runners (Windows in particular) we've seen a few-ms cold start.
    let client = reqwest::Client::new();
    let healthz_url = format!("http://127.0.0.1:{port}/healthz");
    for _ in 0..30 {
        if let Ok(resp) = client.get(&healthz_url).send().await {
            if resp.status().is_success() {
                break;
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    // POST a realistic CS2 GSI payload. PR 10 added weapons + scores +
    // bomb state, so the fixture exercises every field the HUD reads.
    let payload = serde_json::json!({
        "provider": {"name": "Counter-Strike: Global Offensive", "timestamp": 1747143600u64},
        "map": {
            "name": "de_mirage",
            "phase": "live",
            "round": 11,
            "team_ct": {"score": 7},
            "team_t":  {"score": 4}
        },
        "round": {"phase": "freezetime", "bomb": "planted"},
        "player": {
            "team": "CT",
            "activity": "playing",
            "state": {
                "money": 4150,
                "health": 100,
                "armor": 100,
                "helmet": true,
                "defusekit": true,
                "equip_value": 4250
            },
            "weapons": {
                "weapon_0": {"name": "weapon_knife",         "type": "Knife",   "state": "holstered"},
                "weapon_1": {"name": "weapon_m4a1",          "type": "Rifle",   "state": "holstered"},
                "weapon_2": {"name": "weapon_smokegrenade",  "type": "Grenade", "state": "active"},
                "weapon_3": {"name": "weapon_flashbang",     "type": "Grenade", "state": "holstered"}
            }
        },
        "auth": {"token": token}
    });

    let resp = client
        .post(format!("http://127.0.0.1:{port}/gsi"))
        .json(&payload)
        .send()
        .await
        .expect("POST should succeed");

    assert!(
        resp.status().is_success(),
        "POST should return 2xx, got {}",
        resp.status()
    );

    // The receiver writes to its state synchronously inside the handler,
    // but tokio task scheduling may take a few microseconds between the
    // axum response and the state being readable. We loop briefly.
    //
    // The MutexGuard MUST be dropped before any `.await` to satisfy
    // clippy::await_holding_lock (the inner scopes below guarantee this).
    for _ in 0..30 {
        let snap = gsi.snapshot().await;
        if snap.payloads_received == 1 {
            // Clone the captured event out of the lock so we can drop the
            // guard before the next await. Mutex locks in tests should
            // never bridge an await boundary.
            let captured_event = {
                let updates = stub.state_updates.lock().unwrap();
                updates.first().cloned()
            };
            let server_status_count = stub.server_statuses.lock().unwrap().len();

            let event = captured_event.expect("expected one captured event");
            assert_eq!(event.map_slug, "mirage");
            assert_eq!(event.activity, "playing");
            // PR 10 additions: typed HUD fields extracted from the fixture.
            assert_eq!(event.money, Some(4150));
            assert_eq!(event.helmet, Some(true));
            assert_eq!(event.defuse_kit, Some(true));
            assert_eq!(event.equip_value, Some(4250));
            assert_eq!(event.ct_score, Some(7));
            assert_eq!(event.t_score, Some(4));
            assert_eq!(event.round_number, Some(12)); // 0-based 11 → 1-based 12
            assert_eq!(event.active_weapon.as_deref(), Some("weapon_smokegrenade"));
            assert_eq!(event.active_utility.as_deref(), Some("smoke"));
            // Both grenades show up in held_utility_slugs.
            assert!(event.held_utility_slugs.contains(&"smoke".to_string()));
            assert!(event.held_utility_slugs.contains(&"flash".to_string()));
            assert_eq!(event.bomb_state.as_deref(), Some("planted"));
            assert_eq!(event.provider_timestamp, Some(1747143600));
            // Status snapshot bumped + at least 2 server-status emits
            // (1 on startup + 1 per accepted payload).
            assert!(server_status_count >= 2);
            assert_eq!(snap.payloads_received, 1);
            assert!(snap.last_event_at.is_some());
            server_handle.abort();
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }

    server_handle.abort();
    panic!("payload was accepted but GsiState.payloads_received never incremented");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn live_http_receiver_rejects_bad_token() {
    let gsi = GsiState::new("correct-token".into(), true);
    let stub = Arc::new(StubEmitter::default());
    let emitter: Arc<dyn EventEmitter> = stub.clone();

    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).expect("bind probe");
    let port = listener.local_addr().expect("local_addr").port();
    drop(listener);

    let gsi_clone = gsi.clone();
    let server_handle = tokio::spawn(async move {
        let _ = run_server_with_emitter(gsi_clone, emitter, port).await;
    });

    let client = reqwest::Client::new();
    let healthz_url = format!("http://127.0.0.1:{port}/healthz");
    for _ in 0..30 {
        if let Ok(resp) = client.get(&healthz_url).send().await {
            if resp.status().is_success() {
                break;
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    let payload = serde_json::json!({
        "map": {"name": "de_mirage", "phase": "live"},
        "player": {"team": "T"},
        "auth": {"token": "WRONG"}
    });

    let resp = client
        .post(format!("http://127.0.0.1:{port}/gsi"))
        .json(&payload)
        .send()
        .await
        .expect("POST should reach server even on rejection");

    assert_eq!(resp.status().as_u16(), 401);
    let snap = gsi.snapshot().await;
    assert_eq!(snap.payloads_received, 0);
    assert!(stub.state_updates.lock().unwrap().is_empty());

    server_handle.abort();
}
