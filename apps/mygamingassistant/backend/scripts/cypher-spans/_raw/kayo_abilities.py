"""KAY/O's lineup-able abilities, as the multi-localize workflow's `abilities` arg expects them.

Shared by every KAY/O args generator, for the same reason as killjoy_abilities.py: these describe
the GAME, not any one creator's footage. The signatures follow valorant-kay-o-lineup-expert.md.

None of the three is `placed` in app/fixtures/utility_types.json: all three are hand-thrown, so all
three carry 4 beats with a `release`.
"""

ABILITIES = {
    "zero-point": {
        "survey": "a BLADE thrown that STICKS to a surface, winds up, then emits a radial "
                  "SUPPRESSION pulse (a translucent expanding ring) = zero-point",
        "landing": "the blade STUCK at its destination and the onset of its suppression PULSE -- "
                   "the expanding translucent ring. A blade still in flight is not the landing.",
        "release": "the blade actually LEAVES THE HAND into its arc -- a held blade with NO "
                   "release = FAIL.",
    },
    "flashdrive": {
        "survey": "a grenade THROWN in an arc that pops into a blinding WHITE FLASH = flashdrive",
        "landing": "the white flash BLOOM at the detonation point -- the first frames of the "
                   "screen whiting out from that direction. A grenade still in flight is not the "
                   "landing.",
        "release": "the grenade actually LEAVES THE HAND into its arc -- a held grenade with NO "
                   "release = FAIL.",
    },
    "fragment": {
        "survey": "a hexagonal device THROWN in an arc that sticks to the floor and detonates in a "
                  "rapid SERIES of purple / blue-white ground explosions = fragment",
        "landing": "the FIRST purple / blue-white ground detonation of the stuck device (concentric "
                   "shockwave rings). The device in mid-air, or already several blasts in, is not "
                   "the landing onset.",
        "release": "the device actually LEAVES THE HAND into its arc -- a held device with NO "
                   "release = FAIL.",
    },
}
