"""WoW feature-request enums: pinned snapshot, Literal parity, class-id parity.

The tuples feed the DB CHECK constraints (migration 0049 holds frozen
copies), the Literal types feed the API schemas, and the frontend keeps its
own unions. A change on one side without the others either rejects valid
values or lets invalid ones through — so they are pinned here and change
together. The frontend's feature-request unions get their own parity check in
the frontend PR; the class ids are checked against the existing classes.ts.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import get_args

from app.core import wow_feature_request_enums as enums
from app.schemas.wow.feature_requests import feature_literals as literals

CLASSES_TS = Path(__file__).resolve().parents[2] / "frontend/src/games/wow-forever/data/classes.ts"


def test_snapshot() -> None:
    assert enums.STORY_STATUSES == (
        "submitted", "open", "planned", "in_progress", "shipped", "not_planned", "duplicate"
    )
    assert enums.PUBLIC_STORY_STATUSES == ("open", "planned", "in_progress", "shipped", "not_planned")
    assert enums.ACTIVE_STORY_STATUSES == ("open", "planned", "in_progress")
    assert enums.STORY_AREAS == (
        "map_travel", "leveling_quests", "professions", "food_consumables", "gold_economy",
        "gear_upgrades", "class_guides", "dungeons_raids", "pvp", "site_app",
    )
    assert enums.FEASIBILITIES == ("feasible", "needs_data", "not_possible")
    assert enums.VERDICTS == ("new", "duplicate", "needs_clarification", "rejected")
    assert enums.VOTE_SOURCES == ("vote", "submission")
    assert enums.CONTEXT_FACTIONS == ("alliance", "horde", "undecided")
    assert enums.BOARD_SORTS == ("top", "new")


def test_private_statuses_are_never_public() -> None:
    assert "submitted" not in enums.PUBLIC_STORY_STATUSES
    assert "duplicate" not in enums.PUBLIC_STORY_STATUSES
    assert set(enums.ACTIVE_STORY_STATUSES) <= set(enums.PUBLIC_STORY_STATUSES)


def test_literals_match_tuples() -> None:
    pairs = [
        (literals.StoryStatus, enums.STORY_STATUSES),
        (literals.PublicStoryStatus, enums.PUBLIC_STORY_STATUSES),
        (literals.StoryArea, enums.STORY_AREAS),
        (literals.Feasibility, enums.FEASIBILITIES),
        (literals.Verdict, enums.VERDICTS),
        (literals.ContextClass, enums.CONTEXT_CLASSES),
        (literals.ContextExperience, enums.CONTEXT_EXPERIENCES),
        (literals.ContextLevelBand, enums.CONTEXT_LEVEL_BANDS),
        (literals.ContextProfession, enums.CONTEXT_PROFESSIONS),
        (literals.ContextActivity, enums.CONTEXT_ACTIVITIES),
        (literals.ContextFaction, enums.CONTEXT_FACTIONS),
        (literals.BoardSort, enums.BOARD_SORTS),
    ]
    for literal, values in pairs:
        assert get_args(literal) == values


def test_triage_cannot_set_duplicate() -> None:
    assert get_args(literals.TriageSettableStatus) == tuple(s for s in enums.STORY_STATUSES if s != "duplicate")


def test_class_ids_match_frontend_classes() -> None:
    source = CLASSES_TS.read_text(encoding="utf-8")
    block = re.search(r"export type WowClassId =(.*?);", source, re.S)
    assert block, "WowClassId union not found in classes.ts"
    frontend_ids = re.findall(r'"([a-z]+)"', block.group(1))
    assert tuple(frontend_ids) + ("undecided",) == enums.CONTEXT_CLASSES
