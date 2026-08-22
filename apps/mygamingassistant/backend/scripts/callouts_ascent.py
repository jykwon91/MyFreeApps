"""Ascent callout -> coarse-zone table. DATA ONLY.

One module per map: the tables are the half of the callout layer that grows with every
new map, and a single combined module ran past the 500-LOC no-growth line (see the app
CLAUDE.md tech-debt policy). ``lineup_callout_tables`` aggregates every map's table into
``CALLOUTS_BY_MAP``; ``lineup_callouts`` re-exports both, so every existing
``from lineup_callouts import ...`` keeps resolving.
"""

# Zones seeded for Ascent: a-site b-site a-main b-main mid MARKET t-spawn ct-spawn.
# Market is its OWN zone here — it is not folded into mid or b-main as it would be on other maps.
# Entries below are backed by `derive_callouts.py ascent`, which reads the zone assignments of the
# 124 already-shipped Ascent lineups rather than trusting map knowledge I would otherwise be
# inventing. Where that derivation was an n-gram artifact (e.g. "mid cubby" appearing to target
# a-site because it came from a "A Site from Mid Cubby" title) the standard callout wins instead.
ASCENT_CALLOUTS = [
    # Riot's own strings first — read_cards.py pulls the location readout verbatim, and VALORANT
    # writes "Defender Side Spawn", which "defender spawn" does not match on a word boundary.
    ("attacker side spawn", "t-spawn"), ("defender side spawn", "ct-spawn"),
    ("attacker spawn", "t-spawn"), ("defender spawn", "ct-spawn"),
    ("ct spawn", "ct-spawn"), ("t spawn", "t-spawn"),
    # "B Spawn" was mapped to ct-spawn on the assumption it named the defenders' spawn. The
    # Tseeky Brimstone source has a "B SPAWN" molly thrown from B Main: its landing frame is an
    # alley of B, and the minimap marker sits hard against the B-site box — while the SAME
    # video's "B ANTIPLANT", whose in-game readout literally says "Defender Side Spawn", puts the
    # marker top-centre, nowhere near it. The callout names the back of B, not the spawn.
    ("b spawn", "b-site"),
    # Plant-spot and role names. Riot carries only 22 Ascent callouts (callout_zones.py) and none
    # of Default / Safe / Gen / Antiplant is among them — they are community terms, so they get a
    # zone from the family they belong to: "<SITE> <spot> N" is a plant on that site, and
    # antiplant denies a plant on that site (same rule as retake/support below).
    ("a default", "a-site"), ("b default", "b-site"), ("a safe", "a-site"),
    ("a antiplant", "a-site"), ("b antiplant", "b-site"), ("a gen", "a-site"),
    # Hyphenated spellings. callout_to_zone strips punctuation to spaces, so Bonsai's "A Anti-Plant"
    # normalizes to "a anti plant" and does NOT match the "a antiplant" entry above - it mapped to
    # no zone at all until these were added, on a source where anti-plant is also the side evidence.
    ("a anti plant", "a-site"), ("b anti plant", "b-site"),
    # A Garden IS a Riot Ascent callout (0.285,0.309), just not one any zone box contains. Nearest
    # box is a-site at d=0.097, ahead of ct-spawn at 0.128 (zone_rank.py). The four Bonsai chapters
    # that stand there all throw onto A site, which is consistent with it being A-side ground.
    ("a garden", "a-site"),
    # "A Orb" is the A-side Ultimate Orb, which Riot carries no callout for. Placed from footage,
    # not from memory: on cs=182 and cs=198 the hot-hands pool burns beside the visible teal orb in
    # a corridor whose in-game location readout says "A Main" - so a-main, NOT the a-site the
    # "A <spot>" family rule below would otherwise have given it.
    ("a orb", "a-main"),
    # Same treatment. On cs=415 the curveball is thrown from A Lobby and pops in the corridor read
    # as "A Main" (sweep_chapter.py 425.0s), so anti-peek denies the A Main peek.
    ("a anti peak", "a-main"),
    # No footage read for this one: on cs=120 the molly lands in the archway feeding B site and the
    # frames do not pin which side of it. Falls back to the role-phrase rule used for retake /
    # support / antiplant below - a lineup named for the site it serves targets that site.
    ("b anti rush", "b-site"),
    ("a heaven", "a-site"), ("a rafters", "a-site"), ("a generator", "a-site"),
    ("a dice", "a-site"), ("a wine", "a-site"), ("a hell", "a-site"), ("a green", "a-site"),
    ("a backsite", "a-site"), ("a back site", "a-site"), ("a back", "a-site"),
    ("a short", "a-site"), ("a site", "a-site"),
    # Role phrases, not places: a "Retake"/"Support" lineup is named for the site it serves, so it
    # targets that site. Semantic rather than derived (Ascent's existing Sova/KAY/O/Viper titles
    # don't use this vocabulary), but it matches how the Summit Fade set was mapped.
    ("a retake", "a-site"), ("b retake", "b-site"),
    ("a support", "a-site"), ("b support", "b-site"),
    ("a lobby", "a-main"), ("a tree", "a-main"), ("a door", "a-main"), ("a main", "a-main"),
    ("b stairs", "b-site"), ("b boat", "b-site"), ("b back", "b-site"),
    ("b corner", "b-site"), ("b front", "b-site"), ("b site", "b-site"),
    ("b lobby", "b-main"), ("b main", "b-main"),
    ("b market", "market"), ("mid market", "market"),
    ("mid link", "mid"), ("mid cubby", "mid"), ("mid top", "mid"), ("top mid", "mid"),
    ("mid bottom", "mid"), ("bottom mid", "mid"), ("mid courtyard", "mid"), ("mid catwalk", "mid"),
    ("market", "market"),
    ("heaven", "a-site"), ("rafters", "a-site"), ("generator", "a-site"), ("dice", "a-site"),
    ("wine", "a-site"), ("hell", "a-site"), ("boat", "b-site"), ("stairs", "b-site"),
    ("tree", "a-main"), ("catwalk", "mid"), ("pizza", "mid"), ("cubby", "mid"),
    ("courtyard", "mid"), ("link", "mid"), ("middle", "mid"), ("mid", "mid"),
    ("ct", "ct-spawn"),
]
