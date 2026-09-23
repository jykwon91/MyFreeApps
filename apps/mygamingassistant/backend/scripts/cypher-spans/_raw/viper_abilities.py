"""Viper's lineup-able abilities, as the multi-localize workflow's `abilities` arg expects them.

Shared by every Viper args generator, for the same reason as killjoy_abilities.py: these describe
the GAME, not any one creator's footage.

None of the three is `placed` in app/fixtures/utility_types.json, so all three carry 4 beats. The
toxic screen is not thrown, but its THROW beat is the fire that launches the emitters (the base Viper
doc maps it that way), so it gets a `release` like the two thrown abilities.
"""

ABILITIES = {
    "snake-bite": {
        "survey": "a canister THROWN in an arc that shatters into a flat green/yellow ACID POOL "
                  "on the ground = snake-bite",
        "landing": "the canister SHATTERING into the acid pool -- the first frames of the green "
                   "pool spreading on the ground where it landed. A pool already fully spread "
                   "long after a cut, or a canister still in flight, is not the landing.",
        "release": "the canister actually LEAVES THE HAND into its arc -- a held canister with NO "
                   "release = FAIL.",
    },
    "poison-cloud": {
        "survey": "an ORB thrown in an arc that lands and blooms into ONE SPHERE of green gas = "
                  "poison-cloud",
        "landing": "the orb at its destination blooming into the green gas SPHERE (the orb can "
                   "land and sit before Viper activates it -- the bloom is the landing). No "
                   "sphere in the LANDING strip = FAIL.",
        "release": "the orb actually LEAVES THE HAND into its arc -- a held orb with NO release = "
                   "FAIL.",
    },
    "toxic-screen": {
        # Aimed FIRST-PERSON, not from a top-down map: the gauntlet is raised, a small green
        # reticle sits on a surface and the minimap previews the wall line (CoachCow frame study,
        # 2026-09-23). The Snapiex-era base doc's "top-down placement mode" was wrong.
        "survey": "Viper raises her gauntlet with a small green reticle on a surface (the minimap "
                  "previews a wall LINE), fires, and a row of emitters rises into a tall WALL of "
                  "green gas = toxic-screen",
        "landing": "the emitters rising / the tall green gas WALL becoming visible along its line. "
                   "The reticle and the minimap line preview before the fire are the AIM, never "
                   "the landing.",
        "release": "the FIRE -- the frame the reticle and the minimap line preview vanish and the "
                   "arm thrusts forward (there is no arc to follow). A reticle still held on the "
                   "surface = FAIL.",
    },
}
