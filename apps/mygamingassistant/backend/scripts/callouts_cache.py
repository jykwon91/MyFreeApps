"""Cache (CS2) callout -> coarse-zone table. DATA ONLY.

One module per map: the tables are the half of the callout layer that grows with every
new map, and a single combined module ran past the 500-LOC no-growth line (see the app
CLAUDE.md tech-debt policy). ``lineup_callout_tables`` aggregates every map's table into
``CALLOUTS_BY_MAP``; ``lineup_callouts`` re-exports both, so every existing
``from lineup_callouts import ...`` keeps resolving.
"""

# Zones seeded for Cache: a-site b-site mid a-main b-main vents sun-room squeaky highway checkers
# t-spawn ct-spawn. 2026 Source 2 remaster, which kept the CS:GO three-lane layout and callouts. On the
# radar A is at the TOP, B at the BOTTOM, T Spawn on the right and CT Spawn on the left.
# T routes: A Main / A Long -> Squeaky (to A); Garage -> Mid -> Highway (to A) or Vents -> Checkers (to
# B); B Halls -> B Main (to B). CTs reach Mid through Z / Connector and B through CT Halls -> Hell / Tree
# / Heaven.
# Deliberately NOT keyed, because each has more than one sense here: bare "main" (A / B), "default" (a box
# on each site), "truck" (T Truck outside A / CT Truck on A), "back site" / "backsite" (used for both
# sites), "new box(es)" (A / B), "boxes" (T Boxes / B Main boxes) and "ct" (usually a side tag in
# titles). "Ninja" and bare "waterfall" are left out: no 2026 Cache guide places either one.
CACHE_CALLOUTS = [
    ("t spawn", "t-spawn"), ("terrorist spawn", "t-spawn"),
    # T Boxes: the open area past T spawn on the way to B.
    ("t boxes", "t-spawn"),
    ("ct spawn", "ct-spawn"), ("counter terrorist spawn", "ct-spawn"), ("ct base", "ct-spawn"),
    # CT Halls run out of CT spawn and split toward Connector (Mid) and Heaven / Hell (B).
    ("ct halls", "ct-spawn"), ("ct hall", "ct-spawn"),
    # --- A approach: Outside A -> A Main (direct) or A Long -> Squeaky --------------------------------
    ("a main", "a-main"), ("lockers", "a-main"), ("locker", "a-main"),
    # Outside A is the T-side yard where A Main and A Long split; T Truck sits there.
    ("outside a", "a-main"), ("a outside", "a-main"), ("t truck", "a-main"),
    # A Long is the rooms from Outside A to the Squeaky door.
    ("squeaky", "squeaky"), ("squeaky door", "squeaky"), ("a long", "squeaky"), ("long a", "squeaky"),
    # --- Highway: the short ramp from the CT end of Mid up onto A -------------------------------------
    ("highway", "highway"), ("hwy", "highway"), ("a highway", "highway"),
    # Ladder runs from Highway up to Balcony; "from ladder" lineups stand on Highway.
    ("ladder", "highway"),
    # --- A site ------------------------------------------------------------------------------------
    ("a site", "a-site"), ("bombsite a", "a-site"), ("site a", "a-site"), ("a default", "a-site"),
    ("a cross", "a-site"), ("a backsite", "a-site"), ("a back site", "a-site"),
    ("quad", "a-site"), ("nbk", "a-site"), ("forklift", "a-site"), ("lamp", "a-site"),
    # Shroud: the boostable boxes on site next to Squeaky -- a site position, not the doorway.
    ("shroud", "a-site"),
    # Balcony is the walkway over Forklift. One guide calls it "A Heaven"; only that qualified form is
    # keyed, because bare "heaven" means B (below).
    ("balcony", "a-site"), ("a balcony", "a-site"), ("a heaven", "a-site"),
    ("ct truck", "a-site"), ("a new box", "a-site"), ("ebox", "a-site"), ("e box", "a-site"),
    ("e-box", "a-site"), ("electro", "a-site"), ("electric box", "a-site"),
    # --- Mid: Garage (T end) -> Mid -> White Box / Z / Connector (CT end) -----------------------------
    ("mid", "mid"), ("middle", "mid"), ("t mid", "mid"), ("ct mid", "mid"), ("top mid", "mid"),
    # Garage is the T-side building leading into Mid, NOT on A. Red is the container inside it; Dumpster
    # is the side room between Garage and B Halls.
    ("garage", "mid"), ("t garage", "mid"), ("garage entry", "mid"), ("red", "mid"),
    ("dumpster", "mid"),
    # Boost overlooks Mid from the Outside A side; Cubby is the hole under it.
    ("boost", "mid"), ("mid boost", "mid"), ("under boost", "mid"), ("cubby", "mid"),
    # White Box sits at the Mid foot of Highway; Ledge is above the closed garage door.
    ("white box", "mid"), ("whitebox", "mid"), ("ledge", "mid"),
    # Z / Connector is the CT path from CT Halls into Mid: smokes "to Connector" land at the CT end of
    # Mid, NOT in Vents.
    ("connector", "mid"), ("ct connector", "mid"), ("z", "mid"), ("z connector", "mid"),
    ("sandbags", "mid"), ("sandbag", "mid"), ("sand bags", "mid"), ("roof", "mid"),
    # --- Vents -> Checkers: the Mid drop into B -------------------------------------------------------
    ("vents", "vents"), ("vent", "vents"), ("mid vents", "vents"), ("b vents", "vents"),
    ("checkers", "checkers"), ("checker", "checkers"),
    # --- B approach: B Halls -> B Main, with Sun Room and Toxic off the side --------------------------
    ("b main", "b-main"), ("b halls", "b-main"), ("b hall", "b-main"), ("b long", "b-main"),
    ("sun room", "sun-room"), ("sunroom", "sun-room"), ("toxic", "sun-room"),
    ("toxic barrels", "sun-room"),
    # --- B site ------------------------------------------------------------------------------------
    ("b site", "b-site"), ("bombsite b", "b-site"), ("site b", "b-site"), ("b default", "b-site"),
    ("b backsite", "b-site"), ("b back site", "b-site"), ("b new boxes", "b-site"),
    # Headshot is the cubby just below B looking down B Main; Pit is the dip under the site.
    ("headshot", "b-site"), ("b headshot", "b-site"), ("pit", "b-site"), ("b pit", "b-site"),
    # Heaven: every 2026 guide puts it on B (ramp from CT Halls up to Rafters over B).
    ("heaven", "b-site"), ("b heaven", "b-site"), ("rafters", "b-site"), ("b rafters", "b-site"),
    # Tree is the big tree in the corner of Hell, the CT approach onto B; a "tree smoke" cuts the CT
    # rotation onto B. It is NOT at A.
    ("tree", "b-site"), ("b tree", "b-site"), ("ct tree", "b-site"), ("tree room", "b-site"),
    ("hell", "b-site"), ("b hell", "b-site"),
]
