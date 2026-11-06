"""The eight reference feature requests, with the tool output Claude should give.

Shared by the mapper and API tests. ``tool_input`` is a realistic
``record_feature_request`` call; ``expected`` is what triage should see after
mapping. The alchemy-potion request is a duplicate of the alchemy-route one,
so its ``duplicate_of`` names that story's short id in the prompt.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class FeatureFixture:
    key: str
    text: str
    context: dict[str, Any]
    tool_input: dict[str, Any]
    verdict: str
    area: str | None
    feasibility: str | None
    topic: str | None = None


def _story(**overrides: Any) -> dict[str, Any]:
    story: dict[str, Any] = {
        "title": "A feature",
        "persona": "a player",
        "i_want": "to see something on the page",
        "so_that": "I spend less time searching",
        "acceptance_criteria": [
            "Given the page, when I open it, then I see the list",
            "Given no rows match, when I filter, then I see an empty-state message",
        ],
        "follow_ups": [],
        "area": "site_app",
        "topic": None,
        "feasibility": "feasible",
        "feasibility_note": None,
    }
    story.update(overrides)
    return story


MAGE_TRAINER = FeatureFixture(
    key="mage_trainer",
    text="Where is the mage trainer for alliance? I can never find it in Stormwind",
    context={"class_id": "mage", "faction": "alliance", "level_band": "11-20"},
    tool_input={
        "verdict": "new",
        "story": _story(
            title="Find my class trainer on the World Map",
            persona="a level 11-20 Alliance mage",
            i_want="to search the World Map for my class trainer",
            so_that="I can train new spells without running around Stormwind",
            acceptance_criteria=[
                "Given the World Map with faction set to Alliance, when I search mage trainer, then the trainers are marked",
                "Given a trainer row, when it is shown, then it carries the label Classic location — may differ in Forever",
                "Given a search with no match, when I search, then I see a no-results message",
            ],
            area="map_travel",
            topic="mage",
        ),
    },
    verdict="new",
    area="map_travel",
    feasibility="feasible",
    topic="mage",
)

ALCHEMY_ROUTE = FeatureFixture(
    key="alchemy_route",
    text="Can you add an alchemy leveling route like the tailoring one?",
    context={"professions": ["alchemy", "herbalism"]},
    tool_input={
        "verdict": "new",
        "story": _story(
            title="Alchemy leveling route",
            persona="a player who levels Alchemy and Herbalism",
            i_want="to follow an Alchemy route like the Tailoring one",
            so_that="I know which potions to craft at each skill level",
            area="professions",
            topic="alchemy",
        ),
    },
    verdict="new",
    area="professions",
    feasibility="feasible",
    topic="alchemy",
)

DUNGEON_AT_24 = FeatureFixture(
    key="dungeon_at_24",
    text="What dungeon should I do at level 24 and how do I get there?",
    context={"level_band": "21-30", "faction": "horde"},
    tool_input={
        "verdict": "new",
        "story": _story(
            title="Dungeons for my level, with directions",
            persona="a level 21-30 Horde player",
            i_want="to see which dungeons fit my level",
            so_that="I join groups for dungeons that give good experience",
            follow_ups=["Walking directions to the dungeon entrance"],
            area="dungeons_raids",
        ),
    },
    verdict="new",
    area="dungeons_raids",
    feasibility="feasible",
)

BIS_PROT_WARRIOR = FeatureFixture(
    key="bis_prot_warrior",
    text="BiS list for prot warrior pre-raid please",
    context={"class_id": "warrior", "level_band": "60-fresh"},
    tool_input={
        "verdict": "new",
        "story": _story(
            title="Pre-raid gear list for Protection warriors",
            persona="a fresh 60 warrior tank",
            i_want="to see a pre-raid gear list for Protection",
            so_that="I know which dungeon drops to chase before raiding",
            area="gear_upgrades",
            topic="warrior",
            feasibility="needs_data",
            feasibility_note="Exact best-in-slot lists wait on Forever's numbers; Item Compare can rank the gear you find meanwhile.",
        ),
    },
    verdict="new",
    area="gear_upgrades",
    feasibility="needs_data",
    topic="warrior",
)

THREAT_METER = FeatureFixture(
    key="threat_meter",
    text="Add a threat meter so I know when I'm about to pull aggro",
    context={},
    tool_input={
        "verdict": "new",
        "story": _story(
            title="Threat meter",
            persona="a player",
            i_want="to see my threat during a fight",
            so_that="I don't pull the boss off the tank",
            area="dungeons_raids",
            feasibility="not_possible",
            feasibility_note="The site can't see a live fight and Forever blocks combat addons; the dungeon pages can explain threat basics.",
        ),
    },
    verdict="new",
    area="dungeons_raids",
    feasibility="not_possible",
)

HYJAL_QUESTS = FeatureFixture(
    key="hyjal_quests",
    text="Show me the quests in the new Mount Hyjal zone",
    context={"level_band": "51-59"},
    tool_input={
        "verdict": "new",
        "story": _story(
            title="Quests in Mount Hyjal",
            persona="a level 51-59 player",
            i_want="to see the quests in Mount Hyjal",
            so_that="I can plan my last levels",
            area="leveling_quests",
            feasibility="needs_data",
            feasibility_note="Mount Hyjal is new in Forever and its quests aren't published yet; the New Player Guide covers the classic zones.",
        ),
    },
    verdict="new",
    area="leveling_quests",
    feasibility="needs_data",
)

HONOR_FARMING = FeatureFixture(
    key="honor_farming",
    text="Best way to farm honor as horde?",
    context={"faction": "horde", "activities": ["pvp"]},
    tool_input={
        "verdict": "new",
        "story": _story(
            title="Honor farming guide",
            persona="a Horde player who does PvP",
            i_want="to read the best ways to earn honor",
            so_that="I reach my PvP rank faster",
            area="pvp",
        ),
    },
    verdict="new",
    area="pvp",
    feasibility="feasible",
)

ALCHEMY_POTIONS_DUPLICATE = FeatureFixture(
    key="alchemy_potions_duplicate",
    text="need a potion leveling guide for alchemist",
    context={"professions": ["alchemy"]},
    tool_input={
        "verdict": "duplicate",
        "duplicate_of": "S1",
        "nuance_note": "Wants the potions named at each step.",
        "story": _story(
            title="Alchemy potion leveling guide",
            persona="a player who levels Alchemy",
            i_want="to follow a potion-by-potion Alchemy guide",
            so_that="I level Alchemy without wasting herbs",
            area="professions",
            topic="alchemy",
        ),
    },
    verdict="duplicate",
    area="professions",
    feasibility="feasible",
    topic="alchemy",
)

ALL_FIXTURES: tuple[FeatureFixture, ...] = (
    MAGE_TRAINER,
    ALCHEMY_ROUTE,
    DUNGEON_AT_24,
    BIS_PROT_WARRIOR,
    THREAT_METER,
    HYJAL_QUESTS,
    HONOR_FARMING,
    ALCHEMY_POTIONS_DUPLICATE,
)
