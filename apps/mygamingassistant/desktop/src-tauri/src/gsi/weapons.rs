//! CS2 weapon slug → MGA `UtilityType` slug mapping.
//!
//! CS2 GSI's `player.weapons` block emits weapon entries keyed by slot
//! number (`weapon_0`, `weapon_1`, ...). Each entry has a `name` field
//! using Valve's internal slug ("weapon_smokegrenade", "weapon_flashbang",
//! etc.). The MGA backend, in contrast, uses short utility slugs
//! ("smoke", "flash", "molotov", "grenade") drawn from
//! `backend/app/fixtures/utility_types.json`.
//!
//! This module is the ONLY place CS2 weapon names get translated to MGA
//! utility-type slugs. Keep it dumb + table-driven so the mapping is
//! grep-able and trivially testable.
//!
//! Notes on Valve's grenade vocabulary:
//!   - `weapon_molotov` is the T-side flame grenade.
//!   - `weapon_incgrenade` is the CT-side incendiary grenade. Different
//!     entity in the engine, but functionally the same on the MGA lineup
//!     library — both produce a fire patch. Mapped to the same `molotov`
//!     utility slug so lineup filtering doesn't fork by side.
//!   - `weapon_hegrenade` is HE. The MGA fixture currently uses the slug
//!     `grenade` for HE (see `utility_types.json`), NOT `he` — we honour
//!     the fixture's choice.
//!   - `weapon_decoy` returns `None` — decoys are intentionally excluded
//!     from the MGA lineup library (decoys are not useful enough to
//!     warrant browsable lineups).
//!
//! Anything that isn't a grenade (knife, rifle, pistol, c4) returns
//! `None`. The frontend only uses utility for narrowing lineup queries,
//! so non-utility weapons are quietly ignored.

/// Map a CS2 GSI weapon slug to the corresponding MGA UtilityType slug.
///
/// Returns `None` for non-utility weapons (knives, rifles, pistols, etc.)
/// and for any unknown future weapon slug Valve may add. Callers should
/// treat `None` as "skip" rather than as an error.
pub fn weapon_to_utility_slug(weapon_name: &str) -> Option<&'static str> {
    // Match on the raw slug Valve sends; case-sensitive because every
    // CS2 GSI sample we've seen uses lowercase. Adding a `to_ascii_lowercase`
    // conversion would mask a real bug if Valve ever changed casing.
    match weapon_name {
        "weapon_smokegrenade" => Some("smoke"),
        "weapon_flashbang" => Some("flash"),
        // Both T-side molotov and CT-side incendiary map to the same MGA
        // utility slug — lineups don't distinguish.
        "weapon_molotov" => Some("molotov"),
        "weapon_incgrenade" => Some("molotov"),
        // CS2 fixture uses `grenade` (not `he`) for HE — see utility_types.json
        "weapon_hegrenade" => Some("grenade"),
        // `weapon_decoy` deliberately returns None — decoys excluded from lineup library.
        _ => None,
    }
}

/// Convenience predicate. `true` for any grenade slug we'd map to a
/// utility type. Useful when filtering a weapons vec.
pub fn is_utility_weapon(weapon_name: &str) -> bool {
    weapon_to_utility_slug(weapon_name).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smoke_grenade_maps_to_smoke() {
        assert_eq!(weapon_to_utility_slug("weapon_smokegrenade"), Some("smoke"));
    }

    #[test]
    fn flashbang_maps_to_flash() {
        assert_eq!(weapon_to_utility_slug("weapon_flashbang"), Some("flash"));
    }

    #[test]
    fn t_molotov_maps_to_molotov() {
        assert_eq!(weapon_to_utility_slug("weapon_molotov"), Some("molotov"));
    }

    #[test]
    fn ct_incendiary_maps_to_molotov() {
        // T-side and CT-side grenades both map to the same MGA slug. This is
        // intentional — lineups for "molotov" cover both.
        assert_eq!(weapon_to_utility_slug("weapon_incgrenade"), Some("molotov"));
    }

    #[test]
    fn he_grenade_maps_to_grenade_slug() {
        // MGA fixture uses `grenade` (NOT `he`) for HE grenade — defending
        // against accidental rename via test.
        assert_eq!(weapon_to_utility_slug("weapon_hegrenade"), Some("grenade"));
    }

    #[test]
    fn decoy_returns_none() {
        // Decoys are deliberately excluded from the lineup library.
        assert_eq!(weapon_to_utility_slug("weapon_decoy"), None);
    }

    #[test]
    fn knife_is_not_utility() {
        assert_eq!(weapon_to_utility_slug("weapon_knife"), None);
    }

    #[test]
    fn rifle_is_not_utility() {
        assert_eq!(weapon_to_utility_slug("weapon_ak47"), None);
        assert_eq!(weapon_to_utility_slug("weapon_m4a1"), None);
        assert_eq!(weapon_to_utility_slug("weapon_awp"), None);
    }

    #[test]
    fn unknown_weapon_returns_none() {
        // Forward-compat: a future weapon Valve adds won't crash; we just
        // return None and the caller skips it.
        assert_eq!(weapon_to_utility_slug("weapon_future_thing"), None);
        assert_eq!(weapon_to_utility_slug(""), None);
        assert_eq!(weapon_to_utility_slug("not_even_a_weapon_prefix"), None);
    }

    #[test]
    fn is_utility_weapon_distinguishes_grenades_from_guns() {
        assert!(is_utility_weapon("weapon_smokegrenade"));
        assert!(is_utility_weapon("weapon_flashbang"));
        assert!(is_utility_weapon("weapon_molotov"));
        assert!(is_utility_weapon("weapon_incgrenade"));
        assert!(is_utility_weapon("weapon_hegrenade"));
        assert!(!is_utility_weapon("weapon_decoy"));
        assert!(!is_utility_weapon("weapon_ak47"));
        assert!(!is_utility_weapon("weapon_knife"));
        assert!(!is_utility_weapon("weapon_c4"));
        assert!(!is_utility_weapon(""));
    }

    #[test]
    fn case_sensitivity_preserved_to_catch_valve_change() {
        // Lowercase slugs match; uppercase would NOT — this is intentional.
        // If Valve ever ships uppercase, the test failure is the early signal.
        assert_eq!(weapon_to_utility_slug("WEAPON_SMOKEGRENADE"), None);
        assert_eq!(weapon_to_utility_slug("weapon_smokeGrenade"), None);
    }
}
