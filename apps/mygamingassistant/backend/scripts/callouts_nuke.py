"""Nuke (CS2) callout -> coarse-zone table. DATA ONLY.

One module per map: the tables are the half of the callout layer that grows with every
new map, and a single combined module ran past the 500-LOC no-growth line (see the app
CLAUDE.md tech-debt policy). ``lineup_callout_tables`` aggregates every map's table into
``CALLOUTS_BY_MAP``; ``lineup_callouts`` re-exports both, so every existing
``from lineup_callouts import ...`` keeps resolving.
"""

# Zones seeded for Nuke: upper-a lower-b a-ramp outside lobby t-spawn ct-spawn.
# Nuke is stacked: A is the UPPER floor (Hut / Heaven / Rafters / Main), B is directly beneath it on
# the LOWER floor (Doors / Window / Decon / Dark), and Vents, Ramp and Secret join the floors. The
# seeded "a-ramp" zone is the one the pack names plain "Ramp": the T route Lobby -> Radio ->
# Trophy/Control -> Ramp down toward B. Bare "window", "doors", "stack", "boost", "default" and
# "site" are deliberately NOT keys: each has more than one sense on this map.
NUKE_CALLOUTS = [
    ("t spawn", "t-spawn"), ("terrorist spawn", "t-spawn"),
    ("ct spawn", "ct-spawn"), ("counter terrorist spawn", "ct-spawn"), ("ct box", "ct-spawn"),
    # Lockers is the CT locker room between spawn and Outside/Secret; its window overlooks Garage.
    ("lockers", "ct-spawn"), ("locker", "ct-spawn"), ("locker room", "ct-spawn"),
    ("lockers window", "ct-spawn"), ("locker window", "ct-spawn"),
    # --- Lobby: the first room off T spawn, fanning out to Squeaky/Hut (A) and Radio (Ramp) --------
    ("lobby", "lobby"), ("t lobby", "lobby"),
    # Sandbags and Tetris are the cover inside Lobby in front of the Hut entrance.
    ("sandbags", "lobby"), ("tetris", "lobby"),
    # Radio sits between Lobby and Trophy: still the T side of the Ramp route.
    ("radio", "lobby"), ("radio room", "lobby"), ("vending", "lobby"),
    # --- Ramp: Trophy -> Control -> Ramp, the T lane down to B (seeded zone "a-ramp", named Ramp) --
    ("ramp", "a-ramp"), ("ramp room", "a-ramp"), ("top ramp", "a-ramp"), ("bottom ramp", "a-ramp"),
    ("ramp boost", "a-ramp"), ("ramp stack", "a-ramp"), ("big box", "a-ramp"),
    ("headshot", "a-ramp"), ("ramp headshot", "a-ramp"),
    # Control is the room between Trophy and the head of Ramp; its windows look toward B but it is
    # the Ramp approach, not the site.
    ("trophy", "a-ramp"), ("trophy room", "a-ramp"),
    ("control", "a-ramp"), ("control room", "a-ramp"),
    # Turnpike (Toxic, after the barrels) is the hall off the top of Ramp, fought over as Ramp.
    ("turnpike", "a-ramp"), ("turn pike", "a-ramp"), ("toxic", "a-ramp"), ("toxic barrels", "a-ramp"),
    # --- A (upper floor) ------------------------------------------------------------------------
    ("a site", "upper-a"), ("bombsite a", "upper-a"), ("site a", "upper-a"),
    ("upper", "upper-a"), ("upper a", "upper-a"), ("a upper", "upper-a"), ("a default", "upper-a"),
    ("hut", "upper-a"), ("top hut", "upper-a"), ("a hut", "upper-a"), ("hut door", "upper-a"),
    ("squeaky", "upper-a"), ("squeaky door", "upper-a"),
    # Heaven: only A has one (the CT perch over A). Hell is the space beneath it.
    ("heaven", "upper-a"), ("a heaven", "upper-a"), ("hell", "upper-a"),
    ("rafters", "upper-a"), ("mustang", "upper-a"), ("bridge", "upper-a"),
    # Main is the hall between A site and Outside; Nuke has no B Main.
    ("main", "upper-a"), ("a main", "upper-a"), ("top main", "upper-a"),
    # Vents: unqualified means the A hatch; the B-floor half is keyed below as bottom/back vents.
    ("vents", "upper-a"), ("vent", "upper-a"), ("a vents", "upper-a"), ("a vent", "upper-a"),
    ("top vents", "upper-a"), ("upper vents", "upper-a"),
    # --- B (lower floor, directly under A) ------------------------------------------------------
    ("b site", "lower-b"), ("bombsite b", "lower-b"), ("site b", "lower-b"),
    ("lower", "lower-b"), ("lower b", "lower-b"), ("b lower", "lower-b"), ("b default", "lower-b"),
    ("b doors", "lower-b"), ("double doors", "lower-b"), ("b window", "lower-b"),
    ("window room", "lower-b"), ("dark", "lower-b"), ("b dark", "lower-b"),
    ("decon", "lower-b"), ("decontamination", "lower-b"),
    ("b vents", "lower-b"), ("bottom vents", "lower-b"), ("lower vents", "lower-b"),
    ("back vents", "lower-b"), ("tunnels", "lower-b"), ("b tunnels", "lower-b"),
    ("bottom secret", "lower-b"), ("lower secret", "lower-b"), ("secret tunnel", "lower-b"),
    # --- Outside: the yard between Silo, Garage, Secret and A Main -----------------------------
    ("outside", "outside"), ("yard", "outside"), ("outside yard", "outside"),
    ("silo", "outside"), ("t red", "outside"), ("ct red", "outside"),
    ("mini", "outside"), ("garage", "outside"),
    # T Roof runs from above Lobby out to the top of Silo; lineups there smoke the yard.
    ("t roof", "outside"), ("roof", "outside"),
    # Bare "secret" = the top of the Secret stairs, the yard corner CTs hold.
    ("secret", "outside"), ("top secret", "outside"), ("secret cross", "outside"),
    # "Outside heaven" is the raised CT position over the yard, NOT A Heaven.
    ("outside heaven", "outside"),
]
