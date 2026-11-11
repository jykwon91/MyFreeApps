"""Unit tests for the cached-proposal validity check and the context marker."""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from app.services.resume_refinement.cached_proposal import is_cached_proposal_usable
from app.services.resume_refinement.session_helpers import (
    _build_prior_context,
    _prior_context_marker,
)

_TEXT = "Built the billing API."
_DRAFT = f"## Experience\n- {_TEXT}\n- Wrote docs."


def _target(**overrides: Any) -> dict[str, Any]:
    return {"section": "exp", "current_text": _TEXT, **overrides}


def _entry(**overrides: Any) -> dict[str, Any]:
    return {
        "section": "exp",
        "proposal": "cached",
        "guard_flagged": None,
        "target_text": _TEXT,
        "draft_occurrences": 1,
        "context_marker": 4,
        "confirmed_facts_count": 0,
        **overrides,
    }


def _usable(
    entry: dict[str, Any] | None,
    *,
    target: dict[str, Any] | None = None,
    draft: str = _DRAFT,
    marker: int = 4,
    confirmed: int = 0,
) -> bool:
    return is_cached_proposal_usable(
        entry,
        target=target or _target(),
        current_draft=draft,
        context_marker=marker,
        confirmed_facts_count=confirmed,
    )


class TestIsCachedProposalUsable:
    def test_matching_entry_is_usable(self) -> None:
        assert _usable(_entry())

    @pytest.mark.parametrize("entry", [None, {}])
    def test_missing_entry_is_not_usable(self, entry: dict[str, Any] | None) -> None:
        assert not _usable(entry)

    def test_different_section_is_not_usable(self) -> None:
        assert not _usable(_entry(section="skills"))

    @pytest.mark.parametrize("text", ["", None])
    def test_empty_target_text_is_not_usable(self, text: str | None) -> None:
        assert not _usable(_entry(target_text=text), target=_target(current_text=text))

    def test_entry_without_recorded_text_is_not_usable(self) -> None:
        entry = _entry()
        del entry["target_text"]
        assert not _usable(entry)

    def test_entry_for_different_text_is_not_usable(self) -> None:
        assert not _usable(_entry(target_text="Something else."))

    def test_entry_without_recorded_occurrences_is_not_usable(self) -> None:
        entry = _entry()
        del entry["draft_occurrences"]
        assert not _usable(entry)

    def test_text_removed_from_draft_is_not_usable(self) -> None:
        assert not _usable(_entry(), draft="## Experience\n- Wrote docs.")

    def test_text_duplicated_in_draft_is_not_usable(self) -> None:
        assert not _usable(_entry(), draft=f"{_DRAFT}\n- {_TEXT}")

    def test_marker_change_is_not_usable(self) -> None:
        assert not _usable(_entry(context_marker=4), marker=7)

    def test_entry_without_marker_is_not_usable(self) -> None:
        entry = _entry()
        del entry["context_marker"]
        assert not _usable(entry)

    def test_flagged_entry_usable_while_confirmed_facts_unchanged(self) -> None:
        assert _usable(_entry(guard_flagged=["40%"], confirmed_facts_count=2), confirmed=2)

    def test_flagged_entry_stale_after_facts_confirmed(self) -> None:
        assert not _usable(_entry(guard_flagged=["40%"], confirmed_facts_count=0), confirmed=1)

    def test_unflagged_entry_ignores_confirmed_facts(self) -> None:
        assert _usable(_entry(confirmed_facts_count=0), confirmed=3)


def _turn(index: int, role: str, **fields: Any) -> SimpleNamespace:
    base: dict[str, Any] = {
        "turn_index": index,
        "role": role,
        "target_section": "exp",
        "rationale": None,
        "clarifying_question": None,
        "user_text": None,
    }
    return SimpleNamespace(**{**base, **fields})


class TestPriorContextMarker:
    def test_no_turns_is_minus_one(self) -> None:
        assert _prior_context_marker([]) == -1

    def test_plain_accept_and_skip_turns_do_not_move_marker(self) -> None:
        turns = [
            _turn(0, "ai_critique", rationale="framing"),
            _turn(1, "user_accept"),
            _turn(2, "user_skip"),
            _turn(3, "ai_proposal"),
        ]
        assert _prior_context_marker(turns) == 0

    @pytest.mark.parametrize(
        ("role", "fields"),
        [
            ("ai_critique", {"rationale": "framing"}),
            ("ai_proposal", {"clarifying_question": "Which docs?"}),
            ("user_custom", {"user_text": "my words"}),
            ("user_request_alternative", {"user_text": "shorter"}),
        ],
    )
    def test_context_turns_move_marker(self, role: str, fields: dict[str, Any]) -> None:
        turns = [_turn(0, "user_accept"), _turn(5, role, **fields)]
        assert _prior_context_marker(turns) == 5

    def test_blank_text_does_not_move_marker(self) -> None:
        assert _prior_context_marker([_turn(2, "user_custom", user_text="  ")]) == -1

    @pytest.mark.parametrize("role", ["user_accept", "user_skip", "ai_proposal", "session_complete"])
    def test_marker_agrees_with_build_prior_context(self, role: str) -> None:
        turns = [_turn(3, role)]
        assert (_prior_context_marker(turns) == -1) == (_build_prior_context(turns) == [])
