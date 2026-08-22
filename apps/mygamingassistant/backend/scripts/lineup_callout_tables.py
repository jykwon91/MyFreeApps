"""Aggregate every map's callout table into one lookup.

DATA ONLY — no logic. Each map's table lives in its own ``callouts_<map>.py`` module
(see the header there for why). Add a new map by writing that module and adding one line
to the import and one to ``CALLOUTS_BY_MAP`` below.

Keyed on the pack's own map_slug and FAILS LOUD for a map with no table: falling back to
another map's would silently map (say) an Ascent "Market" callout onto a Summit zone that
does not exist on Ascent, and the only symptom would be wrong pins at the operator's
eyeball gate.

Same purity contract as before: constants only, no argv, no filesystem, no reconcile
globals.
"""
from callouts_abyss import ABYSS_CALLOUTS
from callouts_ascent import ASCENT_CALLOUTS
from callouts_breeze import BREEZE_CALLOUTS
from callouts_haven import HAVEN_CALLOUTS
from callouts_lotus import LOTUS_CALLOUTS
from callouts_split import SPLIT_CALLOUTS
from callouts_summit import SUMMIT_CALLOUTS
from callouts_sunset import SUNSET_CALLOUTS

# Callout -> coarse map-zone slug, PER MAP. Longest match first, so "bottom mid" beats
# "mid" and "b gym" beats "b".
CALLOUTS_BY_MAP = {
    "abyss": ABYSS_CALLOUTS,
    "ascent": ASCENT_CALLOUTS,
    "breeze": BREEZE_CALLOUTS,
    "haven": HAVEN_CALLOUTS,
    "lotus": LOTUS_CALLOUTS,
    "split": SPLIT_CALLOUTS,
    "summit": SUMMIT_CALLOUTS,
    "sunset": SUNSET_CALLOUTS,
}
