//! CS2 GSI JSON payload types + normalized event emitted to the frontend.
//!
//! CS2 (post-CSGO) GSI payload is largely the same shape as legacy CSGO's.
//! Reference (community-documented since the official Valve docs are sparse):
//!   - https://developer.valvesoftware.com/wiki/Counter-Strike_Global_Offensive_Game_State_Integration
//!
//! Design constraints:
//!   1. **Forward-compatible** — CS2 sometimes adds fields; using
//!      `#[serde(default)]` on every field means an unknown shape never
//!      crashes the receiver. Unknown nested objects fall into
//!      `serde_json::Value` so they're preserved without a struct definition.
//!   2. **Side normalization** — CS2 sends `"T"` / `"CT"`; the rest of the
//!      app speaks `side_a` / `side_b` / `any` (per `Lineup.side` enum). We
//!      translate at parse time so the frontend never sees raw GSI strings.
//!   3. **Map slug normalization** — CS2 sends `"de_mirage"`; the backend
//!      uses `"mirage"` as the canonical slug (see
//!      `apps/mygamingassistant/backend/app/fixtures/cs2_maps.json`).

use serde::{Deserialize, Serialize};

// ===========================================================================
// Raw CS2 GSI payload
// ===========================================================================

/// Top-level raw GSI payload as posted by CS2.
///
/// Every field is `#[serde(default)]` so a payload missing entire sections
/// (e.g., menu state with no `map` or `player` block) still parses.
#[derive(Debug, Default, Deserialize, Serialize)]
pub struct RawGsiPayload {
    /// Provider block — identifies the CS2 instance. We don't gate on this
    /// today but capturing it future-proofs us against multi-CS2-instance
    /// setups (uncommon, but possible).
    #[serde(default)]
    pub provider: Option<serde_json::Value>,

    /// Map block — present whenever a map is loaded (including warmup,
    /// halftime, and game-over screens).
    #[serde(default)]
    pub map: Option<RawGsiMap>,

    /// Round block — phase + winning team if any.
    #[serde(default)]
    pub round: Option<RawGsiRound>,

    /// The local player block — team, money, weapons, activity. CS2 also
    /// sends an `allplayers` block on observer endpoints but we don't
    /// subscribe to those.
    #[serde(default)]
    pub player: Option<RawGsiPlayer>,

    /// Auth block — verified BEFORE this struct is exposed to the frontend.
    /// See `server::handle_gsi_post`.
    #[serde(default)]
    pub auth: Option<RawGsiAuth>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
pub struct RawGsiMap {
    /// e.g. `"de_mirage"`. Normalized to `"mirage"` for the frontend.
    #[serde(default)]
    pub name: Option<String>,
    /// `"warmup" | "live" | "intermission" | "gameover"`.
    #[serde(default)]
    pub phase: Option<String>,
    /// Round number (0-based, sometimes -1 in warmup).
    #[serde(default)]
    pub round: Option<i32>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
pub struct RawGsiRound {
    /// `"freezetime" | "live" | "over"`.
    #[serde(default)]
    pub phase: Option<String>,
    /// `"t" | "ct"` if a side won the round; absent during the round.
    #[serde(default)]
    pub win_team: Option<String>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
pub struct RawGsiPlayer {
    /// `"T" | "CT"` — the local player's current team.
    /// (CS2 sometimes posts lowercase; we treat both as valid below.)
    #[serde(default)]
    pub team: Option<String>,
    /// e.g. `"playing" | "menu" | "textinput"` — useful to suppress live
    /// updates while the player is in chat.
    #[serde(default)]
    pub activity: Option<String>,
    /// Detailed inventory + money + health — we passthrough for the live HUD.
    #[serde(default)]
    pub state: Option<serde_json::Value>,
    /// Cumulative round/kill stats.
    #[serde(default)]
    pub match_stats: Option<serde_json::Value>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
pub struct RawGsiAuth {
    /// Shared secret matching the cfg we install. Server discards payloads
    /// where this doesn't match the in-memory token.
    #[serde(default)]
    pub token: Option<String>,
}

// ===========================================================================
// Normalized event emitted to the frontend
// ===========================================================================

/// Three-valued side enum matching the rest of the MGA stack.
///
/// Frontend `Lineup.side` is `"side_a" | "side_b" | "any" | null`. CS2 only
/// uses two sides (T = side_a, CT = side_b); `Any` is the explicit "no side
/// information available" state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NormalizedSide {
    /// CS2 T (Terrorists). Maps to `side_a` per the seeded `games` fixture.
    SideA,
    /// CS2 CT (Counter-Terrorists). Maps to `side_b`.
    SideB,
    /// Side unknown (menu, spectating, warmup).
    Any,
}

/// Normalized event emitted to the frontend via `app.emit("gsi:state-update", ...)`.
///
/// **Stability contract**: this shape is part of the IPC API. If you change
/// field names or types, also update `frontend/src/types/desktop.ts` and the
/// `useGsiState` hook in the same PR.
#[derive(Debug, Clone, Serialize)]
pub struct GsiEvent {
    /// Canonical MGA map slug (e.g., `"mirage"`, NOT `"de_mirage"`). Empty
    /// string when no map is loaded (menu state).
    pub map_slug: String,
    /// Map phase: `"warmup" | "live" | "intermission" | "gameover" | ""`.
    pub map_phase: String,
    /// Local player's side, normalized.
    pub side: NormalizedSide,
    /// Round phase: `"freezetime" | "live" | "over" | ""`.
    pub round_phase: String,
    /// Activity (e.g., `"playing"`, `"menu"`) — useful for suppressing live
    /// HUD updates while the user is in chat.
    pub activity: String,
    /// Passthrough of the raw player state block (money, weapons, health)
    /// for live HUD display. Kept as `serde_json::Value` so we don't have to
    /// re-derive every weapon ID — the frontend already knows how to render
    /// money + held weapon.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub player_state: Option<serde_json::Value>,
    /// Passthrough match stats (kills, score, MVP count). Same rationale.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub match_stats: Option<serde_json::Value>,
    /// ISO-8601 timestamp (RFC 3339) at which the receiver parsed this
    /// payload. The frontend uses it to compute "X seconds ago" for the
    /// status indicator.
    pub received_at: String,
}

// ===========================================================================
// Normalization
// ===========================================================================

/// Strip the `de_` / `cs_` / `ar_` Source-engine prefix from a CS2 map name.
///
/// CS2 posts `"de_mirage"`; the MGA backend canonicalizes to `"mirage"` (see
/// `cs2_maps.json`). Unknown / non-prefixed names pass through unchanged so a
/// future map (or a custom workshop map) still shows up — we just won't find
/// matching lineups for it, which the frontend handles gracefully.
pub fn normalize_map_name(raw: &str) -> String {
    // Source-engine map prefixes seen in CS2:
    //   de_  defuse
    //   cs_  hostage rescue (legacy)
    //   ar_  arms race (legacy)
    //   dz_  danger zone (legacy)
    // Stripping the prefix is purely cosmetic — the backend slug is the
    // authoritative match key.
    for prefix in &["de_", "cs_", "ar_", "dz_"] {
        if let Some(rest) = raw.strip_prefix(prefix) {
            return rest.to_string();
        }
    }
    raw.to_string()
}

/// Map CS2's `"T"` / `"CT"` strings (case-insensitive) to MGA's side enum.
pub fn normalize_side(raw: Option<&str>) -> NormalizedSide {
    match raw.map(str::trim).map(str::to_ascii_uppercase).as_deref() {
        Some("T") => NormalizedSide::SideA,
        Some("CT") => NormalizedSide::SideB,
        _ => NormalizedSide::Any,
    }
}

/// Convert a parsed `RawGsiPayload` into the normalized `GsiEvent` we emit
/// to the frontend. Pure function — no IO, no logging, no time injection
/// (caller passes `received_at`) so it's trivially unit-testable.
pub fn normalize_payload(raw: &RawGsiPayload, received_at: String) -> GsiEvent {
    let map_slug = raw
        .map
        .as_ref()
        .and_then(|m| m.name.as_deref())
        .map(normalize_map_name)
        .unwrap_or_default();

    let map_phase = raw
        .map
        .as_ref()
        .and_then(|m| m.phase.clone())
        .unwrap_or_default();

    let side = normalize_side(raw.player.as_ref().and_then(|p| p.team.as_deref()));

    let round_phase = raw
        .round
        .as_ref()
        .and_then(|r| r.phase.clone())
        .unwrap_or_default();

    let activity = raw
        .player
        .as_ref()
        .and_then(|p| p.activity.clone())
        .unwrap_or_default();

    let player_state = raw.player.as_ref().and_then(|p| p.state.clone());
    let match_stats = raw.player.as_ref().and_then(|p| p.match_stats.clone());

    GsiEvent {
        map_slug,
        map_phase,
        side,
        round_phase,
        activity,
        player_state,
        match_stats,
        received_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_map_name_strips_de_prefix() {
        assert_eq!(normalize_map_name("de_mirage"), "mirage");
        assert_eq!(normalize_map_name("de_inferno"), "inferno");
        assert_eq!(normalize_map_name("de_dust2"), "dust2");
    }

    #[test]
    fn normalize_map_name_strips_other_source_prefixes() {
        assert_eq!(normalize_map_name("cs_office"), "office");
        assert_eq!(normalize_map_name("ar_baggage"), "baggage");
        assert_eq!(normalize_map_name("dz_blacksite"), "blacksite");
    }

    #[test]
    fn normalize_map_name_passes_through_unknown_prefix() {
        // Workshop maps and future Valve maps may not have a `de_` prefix.
        assert_eq!(normalize_map_name("workshop_map_42"), "workshop_map_42");
        assert_eq!(normalize_map_name("mirage"), "mirage");
    }

    #[test]
    fn normalize_side_maps_team_to_enum() {
        assert_eq!(normalize_side(Some("T")), NormalizedSide::SideA);
        assert_eq!(normalize_side(Some("CT")), NormalizedSide::SideB);
        // Case insensitive — CS2 sometimes posts lowercase team strings.
        assert_eq!(normalize_side(Some("t")), NormalizedSide::SideA);
        assert_eq!(normalize_side(Some("ct")), NormalizedSide::SideB);
        // Whitespace tolerated.
        assert_eq!(normalize_side(Some(" CT ")), NormalizedSide::SideB);
    }

    #[test]
    fn normalize_side_returns_any_for_missing_or_unknown() {
        assert_eq!(normalize_side(None), NormalizedSide::Any);
        assert_eq!(normalize_side(Some("")), NormalizedSide::Any);
        assert_eq!(normalize_side(Some("SPECTATOR")), NormalizedSide::Any);
    }

    #[test]
    fn parse_full_payload() {
        // Realistic CS2 GSI payload sampled from community docs. Verifies
        // every field we care about parses without panicking.
        let raw = r#"{
            "provider": {"name": "Counter-Strike: Global Offensive", "appid": 730},
            "map": {
                "name": "de_mirage",
                "phase": "live",
                "round": 5
            },
            "round": {
                "phase": "live"
            },
            "player": {
                "team": "T",
                "activity": "playing",
                "state": {
                    "money": 4150,
                    "health": 100,
                    "armor": 100
                },
                "match_stats": {
                    "kills": 8,
                    "score": 7
                }
            },
            "auth": {"token": "abcd1234"}
        }"#;

        let parsed: RawGsiPayload = serde_json::from_str(raw).expect("parses");
        let event = normalize_payload(&parsed, "2026-05-13T10:00:00Z".into());

        assert_eq!(event.map_slug, "mirage");
        assert_eq!(event.map_phase, "live");
        assert_eq!(event.side, NormalizedSide::SideA);
        assert_eq!(event.round_phase, "live");
        assert_eq!(event.activity, "playing");
        assert!(event.player_state.is_some());
        assert!(event.match_stats.is_some());
        assert_eq!(event.received_at, "2026-05-13T10:00:00Z");
    }

    #[test]
    fn parse_menu_payload_no_map() {
        // CS2 at the main menu posts a much sparser payload.
        let raw = r#"{
            "provider": {"name": "Counter-Strike: Global Offensive"},
            "player": {
                "activity": "menu"
            },
            "auth": {"token": "abcd1234"}
        }"#;

        let parsed: RawGsiPayload = serde_json::from_str(raw).expect("parses");
        let event = normalize_payload(&parsed, "2026-05-13T10:00:00Z".into());

        assert_eq!(event.map_slug, "");
        assert_eq!(event.map_phase, "");
        assert_eq!(event.side, NormalizedSide::Any);
        assert_eq!(event.activity, "menu");
    }

    #[test]
    fn parse_payload_with_unknown_field_does_not_crash() {
        // Forward-compat check: if Valve adds a new top-level field, we
        // ignore it rather than refusing the entire payload.
        let raw = r#"{
            "map": {"name": "de_inferno", "phase": "warmup"},
            "player": {"team": "CT"},
            "auth": {"token": "x"},
            "future_field_valve_adds_in_2027": {"foo": "bar"}
        }"#;

        let parsed: RawGsiPayload = serde_json::from_str(raw).expect("parses");
        let event = normalize_payload(&parsed, "2026-05-13T10:00:00Z".into());

        assert_eq!(event.map_slug, "inferno");
        assert_eq!(event.side, NormalizedSide::SideB);
    }

    #[test]
    fn auth_token_is_parsed_when_present() {
        let raw = r#"{"auth": {"token": "secret123"}}"#;
        let parsed: RawGsiPayload = serde_json::from_str(raw).expect("parses");
        assert_eq!(
            parsed.auth.as_ref().and_then(|a| a.token.as_deref()),
            Some("secret123")
        );
    }
}
