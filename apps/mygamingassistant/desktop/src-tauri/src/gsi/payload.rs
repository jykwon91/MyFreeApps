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
//!   4. **Weapons normalization** — CS2 emits `weapons` as a JSON object
//!      keyed by slot string (`weapon_0`, `weapon_1`, ...). We parse into
//!      a HashMap and convert to a slot-ordered Vec for downstream code
//!      (PR 10). See `parse_weapons_block`.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::gsi::weapons::weapon_to_utility_slug;

// ===========================================================================
// Raw CS2 GSI payload
// ===========================================================================

/// Top-level raw GSI payload as posted by CS2.
///
/// Every field is `#[serde(default)]` so a payload missing entire sections
/// (e.g., menu state with no `map` or `player` block) still parses.
#[derive(Debug, Default, Deserialize, Serialize)]
pub struct RawGsiPayload {
    /// Provider block — identifies the CS2 instance. PR 10 reads
    /// `provider.timestamp` for the HUD's `provider_timestamp` field.
    #[serde(default)]
    pub provider: Option<RawGsiProvider>,

    /// Map block — present whenever a map is loaded (including warmup,
    /// halftime, and game-over screens).
    #[serde(default)]
    pub map: Option<RawGsiMap>,

    /// Round block — phase + winning team if any. PR 10 adds bomb state.
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
pub struct RawGsiProvider {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub appid: Option<u32>,
    #[serde(default)]
    pub version: Option<u32>,
    #[serde(default)]
    pub steamid: Option<String>,
    /// Unix epoch seconds. Monotonic w.r.t. the CS2 host's clock. Useful
    /// only as a sanity-check signal (e.g., "is GSI alive") — we do NOT
    /// use this to estimate round clock. CS2 redacts the actual round
    /// timer from GSI for competitive integrity.
    #[serde(default)]
    pub timestamp: Option<u64>,
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
    /// CT team's current score (rounds won). Absent in menu / pre-warmup.
    #[serde(default)]
    pub team_ct: Option<RawGsiTeamScore>,
    /// T team's current score (rounds won). Absent in menu / pre-warmup.
    #[serde(default)]
    pub team_t: Option<RawGsiTeamScore>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
pub struct RawGsiTeamScore {
    /// Rounds won this half / match. CS2 emits this as a nested int.
    #[serde(default)]
    pub score: Option<u32>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
pub struct RawGsiRound {
    /// `"freezetime" | "live" | "over"`.
    #[serde(default)]
    pub phase: Option<String>,
    /// `"t" | "ct"` if a side won the round; absent during the round.
    #[serde(default)]
    pub win_team: Option<String>,
    /// `"planted" | "defused" | "exploded"` when the bomb has been
    /// touched; absent otherwise. PR 10 surfaces this on the HUD.
    #[serde(default)]
    pub bomb: Option<String>,
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
    /// Steam ID of the local player.
    #[serde(default)]
    pub steamid: Option<String>,
    /// Local player's in-game name (utf-8).
    #[serde(default)]
    pub name: Option<String>,
    /// Detailed inventory + money + health. PR 10 parses this into a
    /// strongly-typed struct so the HUD can render money / armor / kit.
    #[serde(default)]
    pub state: Option<RawGsiPlayerState>,
    /// Cumulative round/kill stats.
    #[serde(default)]
    pub match_stats: Option<serde_json::Value>,
    /// Weapons inventory — CS2 emits as `{"weapon_0": {...}, "weapon_1": {...}}`.
    /// We accept the raw HashMap here and convert to a Vec at normalize time.
    /// `default` lets payloads without weapons (menu, freezetime before
    /// purchase) parse without error.
    #[serde(default)]
    pub weapons: HashMap<String, RawGsiWeapon>,
}

#[derive(Debug, Default, Deserialize, Serialize, Clone)]
pub struct RawGsiPlayerState {
    /// Wallet money (USD). Cap is 16000 in standard CS2 rules.
    #[serde(default)]
    pub money: Option<u32>,
    /// Current HP (0-100).
    #[serde(default)]
    pub health: Option<u32>,
    /// Armor (0-100).
    #[serde(default)]
    pub armor: Option<u32>,
    /// `true` when wearing a helmet (matters for HUD's "+kit" hint).
    #[serde(default)]
    pub helmet: Option<bool>,
    /// `true` when carrying a defuse kit.
    #[serde(default)]
    pub defusekit: Option<bool>,
    /// Total $ value of weapons + grenades currently held. Used by the HUD
    /// to surface buy-tier signals (eco / force-buy / full-buy).
    #[serde(default)]
    pub equip_value: Option<u32>,
    /// Total $ value of all items spent this round (incl. grenades thrown).
    #[serde(default)]
    pub round_totalvalue: Option<u32>,
    /// Flash blind intensity (0-255). 0 = not flashed.
    #[serde(default)]
    pub flashed: Option<u32>,
    /// In a smoke (1) or not (0). CS2 emits as integer for backward compat.
    #[serde(default)]
    pub smoked: Option<u32>,
    /// In a fire (1) or not (0).
    #[serde(default)]
    pub burning: Option<u32>,
    /// Round kills by this player.
    #[serde(default)]
    pub round_kills: Option<u32>,
    /// Round headshot kills by this player.
    #[serde(default)]
    pub round_killhs: Option<u32>,
}

#[derive(Debug, Default, Deserialize, Serialize, Clone)]
pub struct RawGsiWeapon {
    /// e.g. `"weapon_smokegrenade"` — Valve internal slug, fed into the
    /// `weapons` module for utility-type mapping.
    #[serde(default)]
    pub name: Option<String>,
    /// `"Grenade" | "Pistol" | "Rifle" | "SniperRifle" | "Knife" | "C4" |
    /// "Submachine Gun" | "Machine Gun" | "Shotgun" | "Equipment" | "Fists" | ...`.
    /// Useful for type-based filtering but optional in PR 10's HUD path.
    #[serde(default, rename = "type")]
    pub kind: Option<String>,
    /// `"active" | "holstered" | "reloading"`. The "active" weapon is the
    /// one the player is currently holding.
    #[serde(default)]
    pub state: Option<String>,
    /// Skin slug — irrelevant for lineups, captured for future use only.
    #[serde(default)]
    pub paintkit: Option<String>,
    /// Current loaded ammo. Optional for grenades.
    #[serde(default)]
    pub ammo_clip: Option<u32>,
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
///
/// PR 10 added the explicit utility / money / score fields below. The
/// `player_state` and `match_stats` passthroughs are KEPT for backward
/// compatibility — existing consumers that read raw values via those blobs
/// (and the legacy unit tests) continue to work, but new consumers should
/// prefer the typed fields.
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
    // --- PR 10: explicit, strongly-typed HUD fields ---
    /// Bomb state (`"planted" | "defused" | "exploded"`) or `None` when the
    /// bomb is in nobody's hand / waiting to be planted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bomb_state: Option<String>,
    /// Wallet money (USD). `None` when CS2 hasn't sent it yet.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub money: Option<u32>,
    /// HP (0-100).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub health: Option<u32>,
    /// Armor (0-100).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub armor: Option<u32>,
    /// Helmet flag — when armor>0 AND helmet=true, the HUD shows "+kit".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub helmet: Option<bool>,
    /// Defuse kit flag — CT-only signal; rendered as a small "kit" badge.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub defuse_kit: Option<bool>,
    /// Total $ value of currently-equipped items. Used for buy-tier hint.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub equip_value: Option<u32>,
    /// CT team's current round score.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ct_score: Option<u32>,
    /// T team's current round score.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub t_score: Option<u32>,
    /// Round number (1-based for display; CS2 sends 0-based internally and
    /// we add 1 on the way out so the HUD matches CS2's scoreboard).
    /// `None` in pre-warmup / menu.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub round_number: Option<u32>,
    /// Raw Valve slug of the currently-held weapon (`"weapon_smokegrenade"`),
    /// or `None` when no weapon is active (menu state).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_weapon: Option<String>,
    /// MGA utility-type slug corresponding to the active weapon, or `None`
    /// when:
    ///   - The active weapon isn't a grenade (knife, rifle, etc.).
    ///   - The player isn't holding any weapon.
    ///
    /// **This is the primary signal for PR 10's utility-held filter**:
    /// when present, the live lineup query narrows to lineups matching this
    /// utility slug (intersected with map + side).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_utility: Option<String>,
    /// MGA utility-type slugs corresponding to ALL grenades currently in
    /// inventory (deduplicated). Used as the secondary signal — when the
    /// player has utility but isn't actively holding any of it, narrow to
    /// the slugs present in inventory.
    pub held_utility_slugs: Vec<String>,
    /// Unix epoch seconds from CS2's `provider.timestamp`. Useful for
    /// debugging stale-payload detection only — we do NOT use this to
    /// estimate round clock (CS2 redacts that for competitive integrity).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_timestamp: Option<u64>,
    /// Passthrough of the raw player state block. Kept for backward
    /// compatibility with PR 8 consumers + the legacy serialized blob.
    /// Prefer the typed fields above for new code.
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

/// Parse a CS2 GSI weapons HashMap into a slot-ordered Vec.
///
/// CS2 GSI emits weapons keyed by string slot (`"weapon_0"`, `"weapon_1"`,
/// ..., `"weapon_9"`) where the slot is a stable index for the weapon's
/// position in the inventory (not its slot in the loadout). We parse the
/// HashMap into a Vec sorted by the integer slot index so callers get a
/// deterministic order — same payload always produces the same Vec.
///
/// Unparseable keys (the very rare case where Valve adds a non-`weapon_N`
/// key) are filtered out. They count as forward-compat noise.
fn parse_weapons_block(map: &HashMap<String, RawGsiWeapon>) -> Vec<RawGsiWeapon> {
    let mut indexed: Vec<(u32, RawGsiWeapon)> = map
        .iter()
        .filter_map(|(k, v)| {
            // Strip the "weapon_" prefix and parse the slot index.
            let idx_str = k.strip_prefix("weapon_")?;
            let idx: u32 = idx_str.parse().ok()?;
            Some((idx, v.clone()))
        })
        .collect();
    indexed.sort_by_key(|(i, _)| *i);
    indexed.into_iter().map(|(_, w)| w).collect()
}

/// Derive the active weapon's slug + utility-type slug from a weapons Vec.
///
/// CS2 emits weapon state as `"active" | "holstered" | "reloading"`. Only
/// ONE weapon is `"active"` at a time. If none is active (very rare —
/// usually only in transition states), returns `(None, None)`.
fn derive_active_weapon(weapons: &[RawGsiWeapon]) -> (Option<String>, Option<String>) {
    let active = weapons
        .iter()
        .find(|w| w.state.as_deref() == Some("active"));
    match active {
        Some(w) => {
            let name = w.name.clone();
            let utility = w
                .name
                .as_deref()
                .and_then(weapon_to_utility_slug)
                .map(String::from);
            (name, utility)
        }
        None => (None, None),
    }
}

/// Derive deduplicated list of MGA utility slugs for all grenades held.
///
/// We don't preserve slot order — the frontend doesn't care which slot
/// each grenade is in, only which slugs are present. Dedupe is per-slug;
/// holding e.g. two flashbangs gives one `"flash"` entry. (CS2's
/// per-grenade flag limits also mean we shouldn't see duplicates in
/// practice, but the dedupe is cheap insurance.)
fn derive_held_utility_slugs(weapons: &[RawGsiWeapon]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for w in weapons {
        if let Some(name) = w.name.as_deref() {
            if let Some(slug) = weapon_to_utility_slug(name) {
                if !out.iter().any(|s| s == slug) {
                    out.push(slug.to_string());
                }
            }
        }
    }
    out
}

/// Re-encode a `RawGsiPlayerState` as a `serde_json::Value` for the
/// passthrough `player_state` field of the emitted event. Keeps PR 8's
/// backward compat (existing tests + JS consumers that read raw money via
/// `event.player_state.money` still work).
fn player_state_passthrough(state: &RawGsiPlayerState) -> Option<serde_json::Value> {
    // serde_json::to_value should be infallible for this concrete struct;
    // fall back to None on the impossible Err to avoid an unwrap.
    serde_json::to_value(state).ok()
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

    // --- PR 10: derived fields ---
    let bomb_state = raw.round.as_ref().and_then(|r| r.bomb.clone());

    let player_state_ref: Option<&RawGsiPlayerState> =
        raw.player.as_ref().and_then(|p| p.state.as_ref());
    let money = player_state_ref.and_then(|s| s.money);
    let health = player_state_ref.and_then(|s| s.health);
    let armor = player_state_ref.and_then(|s| s.armor);
    let helmet = player_state_ref.and_then(|s| s.helmet);
    let defuse_kit = player_state_ref.and_then(|s| s.defusekit);
    let equip_value = player_state_ref.and_then(|s| s.equip_value);

    let ct_score = raw
        .map
        .as_ref()
        .and_then(|m| m.team_ct.as_ref())
        .and_then(|t| t.score);
    let t_score = raw
        .map
        .as_ref()
        .and_then(|m| m.team_t.as_ref())
        .and_then(|t| t.score);
    // CS2 emits round as 0-based; display as 1-based. Treat negative
    // (warmup) and missing as None.
    let round_number = raw
        .map
        .as_ref()
        .and_then(|m| m.round)
        .filter(|r| *r >= 0)
        .map(|r| (r as u32).saturating_add(1));

    let weapons_vec = raw
        .player
        .as_ref()
        .map(|p| parse_weapons_block(&p.weapons))
        .unwrap_or_default();
    let (active_weapon, active_utility) = derive_active_weapon(&weapons_vec);
    let held_utility_slugs = derive_held_utility_slugs(&weapons_vec);

    let provider_timestamp = raw.provider.as_ref().and_then(|p| p.timestamp);

    // Re-emit player_state for backward compat. PR 8's GsiEvent shape
    // emitted this as a `serde_json::Value` passthrough — keep that working
    // even though we now also publish typed fields.
    let player_state = player_state_ref.and_then(player_state_passthrough);
    let match_stats = raw.player.as_ref().and_then(|p| p.match_stats.clone());

    GsiEvent {
        map_slug,
        map_phase,
        side,
        round_phase,
        activity,
        bomb_state,
        money,
        health,
        armor,
        helmet,
        defuse_kit,
        equip_value,
        ct_score,
        t_score,
        round_number,
        active_weapon,
        active_utility,
        held_utility_slugs,
        provider_timestamp,
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

    // ----- PR 10: weapons parsing -----

    #[test]
    fn parse_weapons_block_orders_by_slot_index() {
        let mut map: HashMap<String, RawGsiWeapon> = HashMap::new();
        map.insert(
            "weapon_2".into(),
            RawGsiWeapon {
                name: Some("weapon_smokegrenade".into()),
                state: Some("holstered".into()),
                ..Default::default()
            },
        );
        map.insert(
            "weapon_0".into(),
            RawGsiWeapon {
                name: Some("weapon_knife".into()),
                state: Some("holstered".into()),
                ..Default::default()
            },
        );
        map.insert(
            "weapon_10".into(),
            RawGsiWeapon {
                name: Some("weapon_flashbang".into()),
                state: Some("active".into()),
                ..Default::default()
            },
        );

        let vec = parse_weapons_block(&map);
        assert_eq!(vec.len(), 3);
        assert_eq!(vec[0].name.as_deref(), Some("weapon_knife"));
        assert_eq!(vec[1].name.as_deref(), Some("weapon_smokegrenade"));
        assert_eq!(vec[2].name.as_deref(), Some("weapon_flashbang"));
    }

    #[test]
    fn parse_weapons_block_skips_non_weapon_keys() {
        let mut map: HashMap<String, RawGsiWeapon> = HashMap::new();
        map.insert("totally_unrelated_key".into(), RawGsiWeapon::default());
        map.insert("weapon_abc".into(), RawGsiWeapon::default());
        map.insert(
            "weapon_0".into(),
            RawGsiWeapon {
                name: Some("weapon_ak47".into()),
                ..Default::default()
            },
        );
        let vec = parse_weapons_block(&map);
        assert_eq!(vec.len(), 1);
        assert_eq!(vec[0].name.as_deref(), Some("weapon_ak47"));
    }

    #[test]
    fn parse_weapons_block_empty_map_returns_empty_vec() {
        let map: HashMap<String, RawGsiWeapon> = HashMap::new();
        let vec = parse_weapons_block(&map);
        assert!(vec.is_empty());
    }

    #[test]
    fn derive_active_weapon_returns_active_slot() {
        let weapons = vec![
            RawGsiWeapon {
                name: Some("weapon_knife".into()),
                state: Some("holstered".into()),
                ..Default::default()
            },
            RawGsiWeapon {
                name: Some("weapon_smokegrenade".into()),
                state: Some("active".into()),
                ..Default::default()
            },
            RawGsiWeapon {
                name: Some("weapon_ak47".into()),
                state: Some("holstered".into()),
                ..Default::default()
            },
        ];
        let (w, util) = derive_active_weapon(&weapons);
        assert_eq!(w.as_deref(), Some("weapon_smokegrenade"));
        assert_eq!(util.as_deref(), Some("smoke"));
    }

    #[test]
    fn derive_active_weapon_none_when_no_active() {
        let weapons = vec![RawGsiWeapon {
            name: Some("weapon_knife".into()),
            state: Some("holstered".into()),
            ..Default::default()
        }];
        let (w, util) = derive_active_weapon(&weapons);
        assert_eq!(w, None);
        assert_eq!(util, None);
    }

    #[test]
    fn derive_active_weapon_active_non_grenade_no_utility() {
        // Player is holding their rifle — active_weapon is set, but
        // active_utility is None because rifles aren't utility.
        let weapons = vec![RawGsiWeapon {
            name: Some("weapon_ak47".into()),
            state: Some("active".into()),
            ..Default::default()
        }];
        let (w, util) = derive_active_weapon(&weapons);
        assert_eq!(w.as_deref(), Some("weapon_ak47"));
        assert_eq!(util, None);
    }

    #[test]
    fn derive_held_utility_slugs_collects_all_grenades() {
        let weapons = vec![
            RawGsiWeapon {
                name: Some("weapon_knife".into()),
                ..Default::default()
            },
            RawGsiWeapon {
                name: Some("weapon_smokegrenade".into()),
                ..Default::default()
            },
            RawGsiWeapon {
                name: Some("weapon_ak47".into()),
                ..Default::default()
            },
            RawGsiWeapon {
                name: Some("weapon_flashbang".into()),
                ..Default::default()
            },
            RawGsiWeapon {
                name: Some("weapon_hegrenade".into()),
                ..Default::default()
            },
        ];
        let slugs = derive_held_utility_slugs(&weapons);
        assert!(slugs.contains(&"smoke".to_string()));
        assert!(slugs.contains(&"flash".to_string()));
        assert!(slugs.contains(&"grenade".to_string()));
        assert_eq!(slugs.len(), 3);
    }

    #[test]
    fn derive_held_utility_slugs_dedupes_duplicate_grenade_types() {
        // Player accidentally has two smoke entries in inventory (rare in
        // practice but the GSI shape doesn't forbid it). Dedupe to one slug.
        let weapons = vec![
            RawGsiWeapon {
                name: Some("weapon_smokegrenade".into()),
                ..Default::default()
            },
            RawGsiWeapon {
                name: Some("weapon_smokegrenade".into()),
                ..Default::default()
            },
        ];
        let slugs = derive_held_utility_slugs(&weapons);
        assert_eq!(slugs, vec!["smoke"]);
    }

    #[test]
    fn derive_held_utility_slugs_empty_when_no_grenades() {
        let weapons = vec![RawGsiWeapon {
            name: Some("weapon_ak47".into()),
            ..Default::default()
        }];
        assert!(derive_held_utility_slugs(&weapons).is_empty());
    }

    // ----- Full payload parsing -----

    #[test]
    fn parse_full_payload() {
        // Realistic CS2 GSI payload sampled from community docs. Verifies
        // every field we care about parses without panicking.
        let raw = r#"{
            "provider": {"name": "Counter-Strike: Global Offensive", "appid": 730, "timestamp": 1747143600},
            "map": {
                "name": "de_mirage",
                "phase": "live",
                "round": 5,
                "team_ct": {"score": 3},
                "team_t":  {"score": 2}
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
                    "armor": 100,
                    "helmet": true,
                    "equip_value": 4750
                },
                "weapons": {
                    "weapon_0": {"name": "weapon_knife", "type": "Knife", "state": "holstered"},
                    "weapon_1": {"name": "weapon_smokegrenade", "type": "Grenade", "state": "active"},
                    "weapon_2": {"name": "weapon_flashbang",    "type": "Grenade", "state": "holstered"}
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

        // PR 10: derived HUD fields
        assert_eq!(event.money, Some(4150));
        assert_eq!(event.health, Some(100));
        assert_eq!(event.armor, Some(100));
        assert_eq!(event.helmet, Some(true));
        assert_eq!(event.equip_value, Some(4750));
        assert_eq!(event.ct_score, Some(3));
        assert_eq!(event.t_score, Some(2));
        assert_eq!(event.round_number, Some(6)); // 0-based 5 → 1-based 6
        assert_eq!(event.active_weapon.as_deref(), Some("weapon_smokegrenade"));
        assert_eq!(event.active_utility.as_deref(), Some("smoke"));
        assert!(event.held_utility_slugs.contains(&"smoke".to_string()));
        assert!(event.held_utility_slugs.contains(&"flash".to_string()));
        assert_eq!(event.provider_timestamp, Some(1747143600));
        // Bomb state absent in this fixture.
        assert_eq!(event.bomb_state, None);
    }

    #[test]
    fn parse_payload_with_missing_weapons_block() {
        // Player block exists but no weapons key (common in menu / freezetime
        // before purchase). The HashMap should default to empty.
        let raw = r#"{
            "map": {"name": "de_mirage", "phase": "live"},
            "player": {"team": "T", "activity": "playing"},
            "auth": {"token": "x"}
        }"#;
        let parsed: RawGsiPayload = serde_json::from_str(raw).expect("parses");
        let event = normalize_payload(&parsed, "2026-05-13T10:00:00Z".into());
        assert!(event.held_utility_slugs.is_empty());
        assert_eq!(event.active_weapon, None);
        assert_eq!(event.active_utility, None);
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
        // PR 10: no map → no scores, no money, no weapons.
        assert_eq!(event.money, None);
        assert_eq!(event.ct_score, None);
        assert_eq!(event.t_score, None);
        assert_eq!(event.active_weapon, None);
        assert_eq!(event.active_utility, None);
        assert!(event.held_utility_slugs.is_empty());
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

    #[test]
    fn bomb_state_planted_is_surfaced() {
        let raw = r#"{
            "map": {"name": "de_mirage", "phase": "live"},
            "round": {"phase": "live", "bomb": "planted"},
            "player": {"team": "CT"},
            "auth": {"token": "x"}
        }"#;
        let parsed: RawGsiPayload = serde_json::from_str(raw).expect("parses");
        let event = normalize_payload(&parsed, "2026-05-13T10:00:00Z".into());
        assert_eq!(event.bomb_state.as_deref(), Some("planted"));
    }

    #[test]
    fn negative_round_number_is_dropped() {
        // CS2 sometimes sends round=-1 during warmup. We treat that as None
        // rather than displaying "Round 0" or a negative.
        let raw = r#"{
            "map": {"name": "de_mirage", "phase": "warmup", "round": -1},
            "player": {"team": "T"},
            "auth": {"token": "x"}
        }"#;
        let parsed: RawGsiPayload = serde_json::from_str(raw).expect("parses");
        let event = normalize_payload(&parsed, "2026-05-13T10:00:00Z".into());
        assert_eq!(event.round_number, None);
    }

    #[test]
    fn player_state_passthrough_preserves_money_for_legacy_consumers() {
        // PR 8 consumers expect `event.player_state.money` to be readable.
        // PR 10 added typed `event.money`, but the passthrough must still
        // populate so old code paths work.
        let raw = r#"{
            "map": {"name": "de_mirage", "phase": "live"},
            "player": {
                "team": "T",
                "state": {"money": 800, "health": 100, "armor": 0}
            },
            "auth": {"token": "x"}
        }"#;
        let parsed: RawGsiPayload = serde_json::from_str(raw).expect("parses");
        let event = normalize_payload(&parsed, "2026-05-13T10:00:00Z".into());
        let ps = event.player_state.expect("player_state should serialize");
        assert_eq!(ps.get("money").and_then(|v| v.as_u64()), Some(800));
    }
}
