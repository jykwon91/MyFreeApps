"""Literal types for the feature-request schemas.

``Literal[...]`` needs the values spelled out for type checkers;
``tests/test_wow_feature_request_enums.py`` checks every one against its tuple
in ``app/core/wow_feature_request_enums.py`` so they never drift.
"""
from typing import Literal

StoryStatus = Literal["submitted", "open", "planned", "in_progress", "shipped", "not_planned", "duplicate"]
PublicStoryStatus = Literal["open", "planned", "in_progress", "shipped", "not_planned"]
# Triage may set any status but ``duplicate`` (only a merge makes that).
TriageSettableStatus = Literal["submitted", "open", "planned", "in_progress", "shipped", "not_planned"]
StoryArea = Literal[
    "map_travel",
    "leveling_quests",
    "professions",
    "food_consumables",
    "gold_economy",
    "gear_upgrades",
    "class_guides",
    "dungeons_raids",
    "pvp",
    "site_app",
]
Feasibility = Literal["feasible", "needs_data", "not_possible"]
Verdict = Literal["new", "duplicate", "needs_clarification", "rejected"]
ContextClass = Literal[
    "druid", "hunter", "mage", "paladin", "priest", "rogue", "shaman", "warlock", "warrior", "undecided"
]
ContextExperience = Literal["new", "returning", "veteran"]
ContextLevelBand = Literal[
    "1-10", "11-20", "21-30", "31-40", "41-50", "51-59", "60-fresh", "60-raiding", "not-playing"
]
ContextProfession = Literal[
    "alchemy",
    "blacksmithing",
    "enchanting",
    "engineering",
    "herbalism",
    "leatherworking",
    "mining",
    "skinning",
    "tailoring",
    "cooking",
    "fishing",
    "first_aid",
]
ContextActivity = Literal[
    "leveling_solo", "leveling_group", "dungeons", "raiding", "pvp", "gathering_gold", "crafting", "casual"
]
ContextFaction = Literal["alliance", "horde", "undecided"]
BoardSort = Literal["top", "new"]
