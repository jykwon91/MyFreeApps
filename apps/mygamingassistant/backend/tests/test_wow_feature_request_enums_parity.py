"""The feature-request enums and the frontend's copies must match.

A status, area or verdict the backend can return but the frontend doesn't know
would render blank or break the board's filters; a context value the frontend
sends that the backend doesn't accept is a 422 on submit. Both sides move
together, same order.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.core import wow_feature_request_enums as enums

ENUMS_FILE = (
    Path(__file__).resolve().parents[2]
    / "frontend/src/games/wow-forever/data/featureRequests/featureRequestEnums.ts"
)

PAIRS: list[tuple[str, tuple[str, ...]]] = [
    ("FEATURE_STORY_STATUSES", enums.STORY_STATUSES),
    ("PUBLIC_STORY_STATUSES", enums.PUBLIC_STORY_STATUSES),
    ("VOTABLE_STORY_STATUSES", enums.ACTIVE_STORY_STATUSES),
    ("FEATURE_AREAS", enums.STORY_AREAS),
    ("FEATURE_FEASIBILITIES", enums.FEASIBILITIES),
    ("SUBMISSION_VERDICTS", enums.VERDICTS),
    ("FEATURE_SORTS", enums.BOARD_SORTS),
    ("CONTEXT_CLASSES", enums.CONTEXT_CLASSES),
    ("CONTEXT_EXPERIENCES", enums.CONTEXT_EXPERIENCES),
    ("CONTEXT_LEVEL_BANDS", enums.CONTEXT_LEVEL_BANDS),
    ("CONTEXT_PROFESSIONS", enums.CONTEXT_PROFESSIONS),
    ("CONTEXT_ACTIVITIES", enums.CONTEXT_ACTIVITIES),
    ("CONTEXT_FACTIONS", enums.CONTEXT_FACTIONS),
]


def _ts_const_array(const_name: str) -> list[str]:
    source = ENUMS_FILE.read_text(encoding="utf-8")
    block = re.search(rf"export const {const_name} = \[(.*?)\] as const", source, re.S)
    assert block, f"{const_name} array not found in {ENUMS_FILE.name}"
    return re.findall(r'"([a-z0-9_-]+)"', block.group(1))


@pytest.mark.parametrize(("ts_name", "backend_values"), PAIRS, ids=[p[0] for p in PAIRS])
def test_frontend_enum_matches_backend(ts_name: str, backend_values: tuple[str, ...]) -> None:
    assert _ts_const_array(ts_name) == list(backend_values)


def test_every_frontend_enum_is_checked() -> None:
    source = ENUMS_FILE.read_text(encoding="utf-8")
    exported = set(re.findall(r"^export const (\w+) = \[", source, re.M))
    assert exported == {name for name, _ in PAIRS}
