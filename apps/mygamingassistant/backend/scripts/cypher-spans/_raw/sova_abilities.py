"""Sova's lineup-able abilities, as the multi-localize workflow's `abilities` arg expects them.

Shared by every Sova args generator, for the same reason as viper_abilities.py: these describe the
GAME, not any one creator's footage. The slugs are the app's own (`recon`, `shock` in
app/fixtures/utility_types.json and every shipped Sova row in data/lineup_library.json). Both are
FIRED from the bow, neither is `placed`, so both carry 4 beats. Owl Drone (a steered drone) and
Hunter's Fury (his ultimate) are not lineups and are left out, like every earlier Sova pack.

Charge (0-2 bars) and bounces (0-2) are cast parameters, not abilities: the workflow asks the
localizer for both on every Sova row, so the survey text names them to keep them in view.
"""

ABILITIES = {
    "recon": {
        "survey": "an arrow FIRED from the drawn bow (charge 0-2 bars, 0-2 bounces off walls) "
                  "that STICKS to a surface and pulses blue SCAN rings that reveal enemies, "
                  "repeating a few times = recon",
        "landing": "the arrow STICKING at its destination and its first blue SCAN pulse -- the "
                   "bolt arriving and emitting the first ring. A bounce off a wall on the way is "
                   "NOT the landing; the landing is where the bolt finally sticks.",
        "release": "the bow LOOSES and the arrow leaves with its trail (bow snaps forward, the "
                   "charge bars on the reticle clear) -- a bow still drawn with NO release = FAIL.",
    },
    "shock": {
        "survey": "an arrow FIRED from the drawn bow (charge 0-2 bars, 0-2 bounces off walls) "
                  "that does NOT stick but DETONATES once in a brief blue/white electric burst, "
                  "leaving nothing behind (often two fired back to back) = shock",
        "landing": "the electric BURST at the impact point -- the first frame of the "
                   "detonation. A bounce off a wall on the way is NOT the landing, and nothing "
                   "persists after the burst.",
        "release": "the bow LOOSES and the arrow leaves with its trail (bow snaps forward, the "
                   "charge bars on the reticle clear) -- a bow still drawn with NO release = FAIL.",
    },
}
