"""Fade's and Phoenix's lineup-able abilities, as the multi-localize workflow's `abilities` arg expects.

Shared by every Fade / Phoenix args generator, for the same reason as viper_abilities.py: these
describe the GAME, not any one creator's footage. Every ability here is THROWN (none is `placed` in
app/fixtures/utility_types.json), so all carry 4 beats. Prowler (a steered creature) and Blaze (a
wall) are not lineups and are left out, like every earlier Fade / Phoenix pack.
"""

FADE = {
    "haunt": {
        "survey": "a dark purple orb THROWN in an arc that, on landing, opens into a watching EYE "
                  "hovering just above the ground and casting a gaze = haunt",
        "landing": "the orb OPENING into the hovering eye -- the first frame the eye shape appears. "
                   "The orb still in flight, or a bounce before it opens, is not the landing.",
        "release": "the orb actually LEAVES THE HAND into its arc -- a held orb with NO release = "
                   "FAIL.",
    },
    "seize": {
        "survey": "a purple ink ball THROWN in an arc that bursts into a flat dark-purple INK POOL "
                  "on the ground, no eye and no gaze = seize",
        "landing": "the ball BURSTING into the ink pool -- the first frames of the pool spreading "
                   "on the ground. No pool in the LANDING strip = FAIL.",
        "release": "the ball actually LEAVES THE HAND into its arc -- a held ball with NO release = "
                   "FAIL.",
    },
}

PHOENIX = {
    "hot-hands": {
        "survey": "a fireball THROWN that lands and spreads a flat orange/red FIRE POOL on the "
                  "ground = hot-hands",
        "landing": "the fireball hitting the ground and the FIRE POOL starting to spread -- the "
                   "first frames of the pool. A pool already burning long after a cut is not the "
                   "onset.",
        "release": "Phoenix's arm snaps forward and the fireball LEAVES THE HAND -- a fireball "
                   "still held in the palm with NO release = FAIL.",
    },
}
