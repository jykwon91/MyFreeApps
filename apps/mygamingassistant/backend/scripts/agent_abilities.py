"""Seeded ability slugs per agent -- the whitelist a localizer's ability call must match.

Shared by reconcile_agent.py (--apply-ability) and merge_spans.py (the gate-passed merge). It used
to live only in reconcile, and merge_spans -- written for the Sova Abyss batch -- hard-coded
Sova's {"recon", "shock"} instead, so the first non-Sova merge aborted on a perfectly valid
"brim-incendiary". One table, two importers, so the next agent is added in one place.

PURE: constant data only, no argv, no filesystem.
"""

AGENT_ABILITIES = {
    "sova": {"recon", "shock"},
    "kay-o": {"flashdrive", "fragment", "zero-point"},
    "viper": {"snake-bite", "poison-cloud", "toxic-screen"},
    "brimstone": {"brim-incendiary", "sky-smoke"},
    "fade": {"haunt", "seize"},
    # Phoenix's sources do NOT label the ability in the chapter title, so --apply-ability is
    # REQUIRED here, not optional — the localizer's curveball-vs-hot-hands call is the only
    # signal. Without this entry the whitelist is empty and every call silently stays
    # UNRESOLVED, shipping whatever provisional label the skeleton guessed.
    "phoenix": {"curveball", "hot-hands"},
}
