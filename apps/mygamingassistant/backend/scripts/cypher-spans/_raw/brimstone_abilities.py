"""Brimstone's lineup-able abilities, as the multi-localize workflow's `abilities` arg expects them.

Shared by every Brimstone args generator, for the same reason as viper_abilities.py: these
describe the GAME, not any one creator's footage.

Only the incendiary is in scope. Sky Smoke is aimed on a tactical map rather than thrown, Stim
Beacon is a buff, and Orbital Strike is the ultimate. brim-incendiary is not `placed` in
app/fixtures/utility_types.json, so it carries the usual 4 beats (STAND / AIM / THROW / LANDING).
"""

ABILITIES = {
    "brim-incendiary": {
        "survey": "Brimstone raises a chunky GRENADE LAUNCHER, fires, and a grenade flies in an "
                  "arc (red/orange trail) that bursts into a round ground FIRE ZONE of "
                  "orange/red flames = brim-incendiary",
        "landing": "the grenade BURSTING into the fire zone -- the first frames of the flames "
                   "spreading on the ground where it settled. A fire zone already fully burning "
                   "long after a cut, or a grenade still flying or bouncing, is not the landing.",
        "release": "the launcher actually FIRES -- the grenade leaves the barrel with the "
                   "launcher's recoil and the trail starting. A raised launcher with NO shot = "
                   "FAIL.",
    },
}
