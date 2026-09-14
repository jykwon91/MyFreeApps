"""Killjoy's lineup-able abilities, as the multi-localize workflow's `abilities` arg expects them.

Shared by every Killjoy args generator. These describe the GAME, not any one creator's footage,
so they are identical across sources -- a per-source copy is how one generator's correction
silently fails to reach the next.

`placement` mirrors app/fixtures/utility_types.json -- turret and alarmbot are `placed` (3 beats,
no THROW), nanoswarm is not (4 beats). ingest_agent re-reads that from the DB and rejects a placed
row carrying a throw, so these must agree.
"""

ABILITIES = {
    "turret": {
        "survey": "a three-legged sentry robot standing deployed on its tripod, eye lit and "
                  "sweeping = turret",
        "landing": "the turret DEPLOYED -- opaque, standing on its tripod with its legs planted "
                   "and its eye lit, and it STAYS PUT when the view moves off it. The translucent "
                   "placement hologram that tracks the crosshair is the AIM, never the LANDING "
                   "(a hologram in the LANDING strip = FAIL).",
    },
    "alarmbot": {
        "survey": "a squat wheeled bot with a single lit eye, sitting on the ground = alarmbot",
        "landing": "the alarmbot DEPLOYED -- settled on the ground on its wheels, upright and its "
                   "eye lit, not still in hand and not merely aimed at the spot.",
    },
    "nanoswarm": {
        "survey": "a small canister THROWN in an arc that settles on the ground and then goes "
                  "covert (near-invisible) = nanoswarm",
        "landing": "the nanoswarm SETTLED at its destination -- the last motion of the canister "
                   "as it comes to rest, immediately before it goes covert. The gas cloud is the "
                   "ACTIVATION, a separate deliberate act often seconds later and after a cut -- "
                   "a cloud in the LANDING strip = FAIL.",
        "release": "the canister actually LEAVES THE HAND into its arc -- a held canister with "
                   "NO release = FAIL. Note Killjoy's EQUIP flourish flips the device up and "
                   "catches it; that is not a release.",
    },
}
