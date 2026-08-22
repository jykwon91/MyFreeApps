"""Split callout -> coarse-zone table. DATA ONLY.

One module per map: the tables are the half of the callout layer that grows with every
new map, and a single combined module ran past the 500-LOC no-growth line (see the app
CLAUDE.md tech-debt policy). ``lineup_callout_tables`` aggregates every map's table into
``CALLOUTS_BY_MAP``; ``lineup_callouts`` re-exports both, so every existing
``from lineup_callouts import ...`` keeps resolving.
"""

# Zones seeded for Split: a-site b-site a-main b-main mid MAIL t-spawn ct-spawn. `mail` is Split's
# own extra zone, the same shape as Ascent's `market` — it must NOT collapse into mid.
#
# Unlike Lotus, applying the standard rule (geometry overrides the name only when the nearest box is
# CLOSE, d <= ~0.11, AND beats the name's family by ~2x) leaves Split with ZERO name/geometry
# conflicts — every callout resolves inside its own family. Two came close and both were settled by
# the margin half of the test rather than by hand:
#   B Tower  — mail 0.037 / b-main 0.053. Close, but only 1.4x, so the B in the name holds.
#   B Stairs — mail 0.112 / ct-spawn 0.127 / b-main 0.146. Nothing is close; the name holds.
SPLIT_CALLOUTS = [
    ("attacker side spawn", "t-spawn"), ("defender side spawn", "ct-spawn"),
    ("attacker spawn", "t-spawn"), ("defender spawn", "ct-spawn"),
    ("ct spawn", "ct-spawn"), ("t spawn", "t-spawn"),
    # `mid mail` MUST precede the bare `mid` entry at the tail, or Split's own mail zone becomes
    # unreachable through Riot's actual callout string and every mail lineup silently lands in mid.
    ("mid mail", "mail"), ("b mail", "mail"), ("mail", "mail"),
    # --- A side ---------------------------------------------------------------------------------
    ("a main", "a-main"),                                       # INSIDE
    ("a lobby", "a-main"),                                      # d=0.103, a-site is 0.265 away
    ("a ramps", "a-main"), ("a ramp", "a-main"),                # d=0.097
    ("a sewer", "a-main"),                                      # d=0.124 — far, but family agrees
    ("a site", "a-site"),                                       # INSIDE
    ("a back", "a-site"), ("a rafters", "a-site"),              # d=0.016 / 0.020
    ("a tower", "a-site"), ("a screens", "a-site"),             # d=0.082 / 0.095
    # --- B side ---------------------------------------------------------------------------------
    ("b site", "b-site"),                                       # INSIDE
    ("b back", "b-site"), ("b alley", "b-site"),                # d=0.021 / 0.072
    # "B Rafter Box" is a PLANT SPOT on the site and must be read before the bare-singular entry
    # below it, which would otherwise claim it for b-main. B Rafters the POSITION stays b-main:
    # nearest box 0.026 vs b-site 0.050, and hoverboarD uses it as an elevated STAND ("B Rafters to
    # B Lobby"), not as somewhere to land utility.
    ("b rafter box", "b-site"),
    ("b rafters", "b-main"), ("b rafter", "b-main"), ("b garage", "b-main"),   # d=0.026 / 0.043
    ("b tower", "b-main"), ("b stairs", "b-main"),              # see the header note
    ("b link", "b-main"), ("b lobby", "b-main"),                # nearest boxes 0.114 / 0.182 — far
    # Not a Riot Split callout — Riot names the B approach Garage/Alley/Lobby — but four creators
    # (Tseeky, hoverboarD, HEHE XD, Brim Sensei) write "B Main" anyway, and its absence blocked
    # every one of those rows.
    ("b main", "b-main"),
    # --- middle ---------------------------------------------------------------------------------
    ("mid bottom", "mid"), ("mid top", "mid"), ("mid vent", "mid"),
    ("bottom mid", "mid"), ("top mid", "mid"),
    # --- community terms ------------------------------------------------------------------------
    ("site a", "a-site"), ("site b", "b-site"),
    ("a default", "a-site"), ("b default", "b-site"),
    ("a retake", "a-site"), ("b retake", "b-site"),
    ("a support", "a-site"), ("b support", "b-site"),
    ("a early info", "a-site"), ("b early info", "b-site"),
    ("a info", "a-site"), ("b info", "b-site"),
    ("a push", "a-site"), ("b push", "b-site"),
    ("a open", "a-site"), ("b open", "b-site"),
    ("a backsite", "a-site"), ("b backsite", "b-site"),
    ("a reveal", "a-site"), ("b reveal", "b-site"),
    ("a god", "a-site"), ("b god", "b-site"),
    ("a anti plant", "a-site"), ("b anti plant", "b-site"),
    # The lookup anchors on \b at BOTH ends, so the singular entry does not match the plural form —
    # "b antiplants" fell through and blocked its row. Plurals need their own entry.
    ("a antiplant", "a-site"), ("b antiplant", "b-site"),
    ("a antiplants", "a-site"), ("b antiplants", "b-site"),
    ("a heaven", "a-site"), ("b heaven", "b-site"),
    # Named plant spots on the sites, from HEHE XD / Tseeky / Ryvlex / Brim Sensei. hoverboarD
    # spells the first one out as "A Site Elbow", which is what settles it as on-site.
    ("a elbow", "a-site"), ("a pocket", "a-site"), ("a safe", "a-site"), ("b safe", "b-site"),
    ("a corner", "a-site"), ("b corner", "b-site"),
    ("a screen", "a-site"), ("a rafter", "a-site"),
    ("a attacker", "a-site"), ("b attacker", "b-site"),
    ("a defender", "a-site"), ("b defender", "b-site"),
    ("defender side", "ct-spawn"),
    # --- bare landmarks, strictly last ----------------------------------------------------------
    # Only the ones with no A/B twin. `tower`, `rafters` and `back` are DELIBERATELY absent: Split
    # carries both an A and a B version of each, and they resolve to different zones (A Tower is
    # a-site while B Tower is b-main), so a bare form would be a coin flip dressed up as an answer.
    # Both spellings: "A Front Screen Plant" carries the singular, and the plural entry cannot match
    # it (\b at both ends). Only A has screens on Split, so bare is unambiguous — including Brim
    # Sensei's "CT Screens", which names the same area viewed from the defender side.
    ("screens", "a-site"), ("screen", "a-site"),
    ("ramps", "a-main"), ("sewer", "a-main"),
    ("alley", "b-site"), ("garage", "b-main"), ("link", "b-main"),
    ("vent", "mid"), ("middle", "mid"), ("mid", "mid"),
    ("ct", "ct-spawn"),
]
