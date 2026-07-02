"""Tests for user-directed targeting (create_target_from_line).

Pure-mock tests in the style of test_resume_refinement_proposal_cache:
no DB, every repo/helper call patched at the session_turn_service
namespace. Plus direct tests of session_target_repo's index-key remap,
which is the load-bearing piece — inserting a target mid-list shifts
later targets, so the index-keyed proposal_cache/guard_flag_counts
must shift too or navigation would hydrate the WRONG cached proposal.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.repositories.resume_refinement.session_target_repo import (
    _shift_index_keys,
    insert_target_at,
)
from app.services.resume_refinement.session_turn_service import (
    _normalize_line,
    create_target_from_line,
)

_USER_ID = uuid.uuid4()
_SESSION_ID = uuid.uuid4()

_SVC = "app.services.resume_refinement.session_turn_service"


def _fake_session(
    *,
    targets: list[dict] | None = None,
    target_index: int = 0,
    turn_count: int = 3,
) -> MagicMock:
    session = MagicMock()
    session.id = _SESSION_ID
    session.improvement_targets = targets
    session.target_index = target_index
    session.turn_count = turn_count
    return session


def _ai_target(current_text: str, section: str = "Experience") -> dict:
    return {
        "section": section,
        "current_text": current_text,
        "improvement_type": "add_metric",
        "severity": "high",
        "notes": None,
    }


# ---------------------------------------------------------------------------
# _normalize_line
# ---------------------------------------------------------------------------


def test_normalize_line_strips_decoration_and_whitespace():
    assert _normalize_line("  **Led** the *team*  ") == "Led the team"


# ---------------------------------------------------------------------------
# _shift_index_keys — the cache-remap invariant
# ---------------------------------------------------------------------------


def test_shift_index_keys_shifts_at_and_after_insert_point():
    cache = {"0": "a", "1": "b", "2": "c"}
    assert _shift_index_keys(cache, insert_at=1) == {"0": "a", "2": "b", "3": "c"}


def test_shift_index_keys_handles_none_and_non_numeric():
    assert _shift_index_keys(None, insert_at=0) == {}
    assert _shift_index_keys({"weird": 1, "0": 2}, insert_at=0) == {"weird": 1, "1": 2}


# ---------------------------------------------------------------------------
# insert_target_at — real repo function against a mock session/db
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_insert_target_at_inserts_activates_and_remaps():
    session = _fake_session(
        targets=[_ai_target("one"), _ai_target("two")], target_index=0,
    )
    session.proposal_cache = {"0": {"proposal": "p0"}, "1": {"proposal": "p1"}}
    session.guard_flag_counts = {"1": 2}
    db = AsyncMock()

    new_target = {"section": "S", "current_text": "clicked", "origin": "user"}
    result = await insert_target_at(db, session, target=new_target, insert_at=1)

    assert [t["current_text"] for t in result.improvement_targets] == [
        "one", "clicked", "two",
    ]
    assert result.target_index == 1
    # Old target "two" moved 1 -> 2; its cache + flag count must follow.
    assert result.proposal_cache == {"0": {"proposal": "p0"}, "2": {"proposal": "p1"}}
    assert result.guard_flag_counts == {"2": 2}
    assert result.pending_proposal is None
    assert result.turn_count == 4


@pytest.mark.asyncio
async def test_insert_target_at_clamps_out_of_bounds_index():
    session = _fake_session(targets=[_ai_target("one")], target_index=5)
    session.proposal_cache = {}
    session.guard_flag_counts = {}
    db = AsyncMock()

    result = await insert_target_at(
        db, session, target={"current_text": "x"}, insert_at=99,
    )
    assert result.target_index == 1
    assert len(result.improvement_targets) == 2


# ---------------------------------------------------------------------------
# create_target_from_line
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_empty_line_raises_value_error():
    session = _fake_session(targets=[])
    with (
        patch(f"{_SVC}._load_active", new_callable=AsyncMock, return_value=session),
    ):
        with pytest.raises(ValueError):
            await create_target_from_line(
                db=AsyncMock(),
                user_id=_USER_ID,
                session_id=_SESSION_ID,
                current_text="  ** **  ",
                section="Experience",
            )


@pytest.mark.asyncio
async def test_click_on_active_target_is_a_noop():
    session = _fake_session(targets=[_ai_target("Led the team")], target_index=0)
    with (
        patch(f"{_SVC}._load_active", new_callable=AsyncMock, return_value=session),
        patch(
            f"{_SVC}._with_turns", new_callable=AsyncMock, return_value=session,
        ) as with_turns,
        patch(f"{_SVC}.session_repo") as repo,
        patch(f"{_SVC}.session_target_repo") as target_repo,
    ):
        result = await create_target_from_line(
            db=AsyncMock(),
            user_id=_USER_ID,
            session_id=_SESSION_ID,
            current_text="**Led** the team",
            section="Experience",
        )
    assert result is session
    with_turns.assert_awaited_once()
    repo.set_target_index.assert_not_called()
    target_repo.insert_target_at.assert_not_called()


@pytest.mark.asyncio
async def test_click_matching_existing_target_jumps_with_cache_hit():
    session = _fake_session(
        targets=[_ai_target("first"), _ai_target("second")], target_index=0,
    )
    with (
        patch(f"{_SVC}._load_active", new_callable=AsyncMock, return_value=session),
        patch(f"{_SVC}._with_turns", new_callable=AsyncMock, side_effect=lambda db, s: s),
        patch(f"{_SVC}.session_repo") as repo,
        patch(
            f"{_SVC}._generate_next_proposal", new_callable=AsyncMock,
        ) as generate,
    ):
        repo.set_target_index = AsyncMock(return_value=session)
        repo.hydrate_pending_from_cache = AsyncMock(return_value=session)
        await create_target_from_line(
            db=AsyncMock(),
            user_id=_USER_ID,
            session_id=_SESSION_ID,
            current_text="second",
            section="Experience",
        )
    repo.set_target_index.assert_awaited_once()
    assert repo.set_target_index.await_args.kwargs["new_index"] == 1
    generate.assert_not_awaited()


@pytest.mark.asyncio
async def test_click_matching_existing_target_generates_on_cache_miss():
    session = _fake_session(
        targets=[_ai_target("first"), _ai_target("second")], target_index=0,
    )
    with (
        patch(f"{_SVC}._load_active", new_callable=AsyncMock, return_value=session),
        patch(f"{_SVC}._with_turns", new_callable=AsyncMock, side_effect=lambda db, s: s),
        patch(f"{_SVC}.session_repo") as repo,
        patch(
            f"{_SVC}._generate_next_proposal",
            new_callable=AsyncMock,
            return_value=session,
        ) as generate,
    ):
        repo.set_target_index = AsyncMock(return_value=session)
        repo.hydrate_pending_from_cache = AsyncMock(return_value=None)
        await create_target_from_line(
            db=AsyncMock(),
            user_id=_USER_ID,
            session_id=_SESSION_ID,
            current_text="second",
            section="Experience",
        )
    generate.assert_awaited_once()


@pytest.mark.asyncio
async def test_new_line_inserts_user_target_after_cursor():
    session = _fake_session(
        targets=[_ai_target("first"), _ai_target("second")],
        target_index=0,
        turn_count=7,
    )
    with (
        patch(f"{_SVC}._load_active", new_callable=AsyncMock, return_value=session),
        patch(f"{_SVC}._with_turns", new_callable=AsyncMock, side_effect=lambda db, s: s),
        patch(f"{_SVC}.turn_repo") as turns,
        patch(f"{_SVC}.session_target_repo") as target_repo,
        patch(
            f"{_SVC}._generate_next_proposal",
            new_callable=AsyncMock,
            return_value=session,
        ) as generate,
    ):
        turns.append = AsyncMock()
        target_repo.insert_target_at = AsyncMock(return_value=session)
        await create_target_from_line(
            db=AsyncMock(),
            user_id=_USER_ID,
            session_id=_SESSION_ID,
            current_text="**A brand new** line",
            section="Projects",
        )

    turns.append.assert_awaited_once()
    turn_kwargs = turns.append.await_args.kwargs
    assert turn_kwargs["role"] == "user_created_target"
    assert turn_kwargs["turn_index"] == 7
    assert turn_kwargs["user_text"] == "A brand new line"

    target_repo.insert_target_at.assert_awaited_once()
    kwargs = target_repo.insert_target_at.await_args.kwargs
    assert kwargs["insert_at"] == 1
    new_target = kwargs["target"]
    assert new_target["origin"] == "user"
    assert new_target["current_text"] == "**A brand new** line"
    assert new_target["section"] == "Projects"
    assert new_target["improvement_type"] == "other"
    assert new_target["severity"] == "low"
    generate.assert_awaited_once()


@pytest.mark.asyncio
async def test_new_line_with_blank_section_falls_back():
    session = _fake_session(targets=[], target_index=0)
    with (
        patch(f"{_SVC}._load_active", new_callable=AsyncMock, return_value=session),
        patch(f"{_SVC}._with_turns", new_callable=AsyncMock, side_effect=lambda db, s: s),
        patch(f"{_SVC}.turn_repo") as turns,
        patch(f"{_SVC}.session_target_repo") as target_repo,
        patch(
            f"{_SVC}._generate_next_proposal",
            new_callable=AsyncMock,
            return_value=session,
        ),
    ):
        turns.append = AsyncMock()
        target_repo.insert_target_at = AsyncMock(return_value=session)
        await create_target_from_line(
            db=AsyncMock(),
            user_id=_USER_ID,
            session_id=_SESSION_ID,
            current_text="orphan line",
            section="   ",
        )
    kwargs = target_repo.insert_target_at.await_args.kwargs
    assert kwargs["target"]["section"] == "Your selection"
    assert kwargs["insert_at"] == 0
