"""CS2's lineup-able grenades, as the multi-localize workflow's `abilities` arg expects.

Shared by every CS2 args generator: these describe the GAME, not any one creator's footage.
Slugs match app/fixtures/utility_types.json (cs2). Decoys are left out -- nobody lines one up.
Every grenade is THROWN, so all carry 4 beats.
"""

_RELEASE = ("the grenade actually LEAVES THE HAND -- the arm snaps forward and the viewmodel "
            "hand comes back empty; on a jump-throw that is at the jump APEX. A grenade still "
            "held with the pin pulled and NO release = FAIL. The practice trajectory line is "
            "never evidence of a release.")

CS2 = {
    "smoke": {
        "survey": "a grenade that lands and blooms into a large grey smoke SPHERE = smoke",
        "landing": "the smoke BLOOMING at the destination -- the first frames of the grey plume "
                   "expanding into its sphere. The grenade still in flight is not the landing.",
        "release": _RELEASE,
    },
    "flash": {
        "survey": "a grenade that pops in a bright WHITE burst (usually in the air, often "
                  "over a wall = a pop-flash) with no smoke and no fire = flash",
        "landing": "the flash DETONATING -- the white burst frame (or, when the camera is the "
                   "one flashed, the screen whiting out). A flash still in flight is not the "
                   "landing.",
        "release": _RELEASE,
    },
    "molotov": {
        "survey": "a bottle/canister that lands and spreads a flat orange FIRE pool on the "
                  "ground = molotov (T molotov and CT incendiary are the same slug)",
        "landing": "the fire POOL starting to spread on the ground -- the first frames of the "
                   "flames. A burning pool long after a cut is not the onset.",
        "release": _RELEASE,
    },
    "grenade": {
        "survey": "an HE grenade that explodes in a short blast with a dust puff and no "
                  "lingering smoke or fire = grenade (HE)",
        "landing": "the HE EXPLODING -- the blast/dust puff frame at the destination.",
        "release": _RELEASE,
    },
}
