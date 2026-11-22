"""Resume refinement holds no database connection while Claude works.

The critique and every rewrite take seconds to minutes. The session row is
read, the connection handed back for the call, and the result saved only if
the session is still where it was when the call began: a user who answered
or moved on meanwhile, or a preparation that changed hands, keeps the newer
state instead of having a stale result written over it. Every write of a
result is made under the row lock and committed once, so another request
that touches the session waits until the whole result is saved.
"""
from __future__ import annotations

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from decimal import Decimal
from typing import Any
from unittest.mock import patch

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import engine as app_engine
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.resume_refinement.session import ResumeRefinementSession
from app.models.resume_refinement.turn import ResumeRefinementTurn
from app.repositories.resume_refinement import turn_repo
from app.services.resume_refinement import critique_service, rewrite_service, session_service
from app.workers.refinement_prepare_worker import process_one_session

_DRAFT = "## Summary\n- first line\n- second line"


def _target(text: str) -> dict[str, Any]:
    return {
        "section": "Summary",
        "current_text": text,
        "improvement_type": "tighten_phrasing",
        "severity": "medium",
        "notes": None,
    }


def _rewrite(text: str) -> dict[str, Any]:
    return {
        "kind": "proposal",
        "rewritten_text": text,
        "rationale": "Tighter.",
        "question": None,
        "input_tokens": 10,
        "output_tokens": 5,
        "cost_usd": Decimal("0.001"),
        "hallucination_flagged": [],
    }


def _cached(target_text: str, proposal: str) -> dict[str, Any]:
    return {
        "section": "Summary",
        "proposal": proposal,
        "rationale": "Tighter.",
        "clarifying_question": None,
        "guard_flagged": None,
        "flagged_proposal": None,
        "target_text": target_text,
        "draft_occurrences": _DRAFT.count(target_text),
        "context_marker": -1,
        "confirmed_facts_count": 0,
    }


def _critique() -> dict[str, Any]:
    return {
        "targets": [_target("- first line")],
        "input_tokens": 50,
        "output_tokens": 20,
        "cost_usd": Decimal("0.002"),
    }


async def _new_session(user_id: str, **values: Any) -> uuid.UUID:
    async with unit_of_work() as db:
        session = ResumeRefinementSession(user_id=uuid.UUID(user_id), current_draft=_DRAFT, **values)
        db.add(session)
        await db.flush()
        return session.id


async def _session(session_id: uuid.UUID) -> ResumeRefinementSession:
    async with unit_of_work() as db:
        session = await db.get(ResumeRefinementSession, session_id)
        assert session is not None
        return session


async def _navigate_back(user: dict, session_id: uuid.UUID) -> None:
    """The user's step back in another tab, through the service the route calls."""
    async with AsyncSessionLocal() as db:
        await session_service.navigate(
            db=db, user_id=uuid.UUID(user["id"]), session_id=session_id, direction="prev",
        )


async def _move(session_id: uuid.UUID, **values: Any) -> None:
    async with unit_of_work() as db:
        await db.execute(
            update(ResumeRefinementSession).where(ResumeRefinementSession.id == session_id).values(**values),
        )


_REAL_APPEND = turn_repo.append
# How long a second request is given to get through while a result is saved.
_GIVE_IT_A_CHANCE = 0.3


class _SecondRequestDuring:
    """Stands in for ``turn_repo.append``: before writing the ``role`` turn, it starts
    ``second`` and records whether it got through while the earlier writes were pending."""

    def __init__(self, role: str, second: Callable[[], Awaitable[object]]) -> None:
        self._role = role
        self._second = second
        self.task: asyncio.Task[object] | None = None
        self.got_through: bool | None = None

    async def append(self, *args: Any, **kwargs: Any) -> object:
        if kwargs.get("role") == self._role and self.task is None:
            self.task = asyncio.create_task(self._second())
            await asyncio.sleep(_GIVE_IT_A_CHANCE)
            self.got_through = self.task.done()
        return await _REAL_APPEND(*args, **kwargs)

    async def finished(self) -> None:
        assert self.task is not None
        await self.task


async def _proposal_turns(session_id: uuid.UUID) -> int:
    async with unit_of_work() as db:
        return (await db.execute(
            select(func.count()).select_from(ResumeRefinementTurn).where(
                ResumeRefinementTurn.session_id == session_id,
                ResumeRefinementTurn.role == "ai_proposal",
            ),
        )).scalar_one()


class TestPreparation:
    @pytest.mark.asyncio
    async def test_critique_and_prefetch_run_with_no_connection_checked_out(self, user_factory) -> None:
        user = await user_factory()
        session_id = await _new_session(user["id"], status="preparing")
        checked_out: list[int] = []

        async def _critique_call(**_: object) -> dict[str, Any]:
            checked_out.append(app_engine.pool.checkedout())
            return _critique()

        async def _rewrite_call(**_: object) -> dict[str, Any]:
            checked_out.append(app_engine.pool.checkedout())
            return _rewrite("- the first line, tighter")

        with (
            patch.object(critique_service, "run_critique", side_effect=_critique_call),
            patch.object(rewrite_service, "run_rewrite", side_effect=_rewrite_call),
        ):
            assert await process_one_session() is True

        session = await _session(session_id)
        assert session.status == "active"
        assert session.pending_proposal == "- the first line, tighter"
        assert checked_out == [0, 0]

    @pytest.mark.asyncio
    async def test_a_critique_for_a_session_that_changed_meanwhile_is_not_saved(self, user_factory) -> None:
        user = await user_factory()
        session_id = await _new_session(user["id"], status="preparing")

        async def _critique_while_session_fails(**_: object) -> dict[str, Any]:
            await _move(session_id, status="failed", error_message="stopped")
            return _critique()

        with patch.object(critique_service, "run_critique", side_effect=_critique_while_session_fails):
            assert await process_one_session() is True

        session = await _session(session_id)
        assert (session.status, session.error_message) == ("failed", "stopped")
        assert session.improvement_targets is None
        assert session.total_tokens_in == 0


    @pytest.mark.asyncio
    async def test_a_change_made_while_the_critique_is_saved_waits_and_then_stands(
        self, user_factory,
    ) -> None:
        user = await user_factory()
        session_id = await _new_session(user["id"], status="preparing")
        second = _SecondRequestDuring(
            "ai_critique", lambda: _move(session_id, status="failed", error_message="stopped"),
        )

        with (
            patch.object(critique_service, "run_critique", return_value=_critique()),
            patch.object(rewrite_service, "run_rewrite", return_value=_rewrite("- the first line, tighter")),
            patch.object(turn_repo, "append", side_effect=second.append),
        ):
            assert await process_one_session() is True
            await second.finished()

        assert second.got_through is False
        session = await _session(session_id)
        # Saved whole, then failed by the other request: never unlocked over it.
        assert session.improvement_targets == [_target("- first line")]
        assert (session.status, session.error_message) == ("failed", "stopped")


class TestTurns:
    @staticmethod
    async def _active_session(user: dict) -> uuid.UUID:
        return await _new_session(
            user["id"],
            status="active",
            improvement_targets=[_target("- first line"), _target("- second line")],
            pending_target_section="Summary",
            pending_proposal="- the first line, tighter",
            proposal_cache={"0": _cached("- first line", "- the first line, tighter")},
        )

    @pytest.mark.asyncio
    async def test_the_next_suggestion_is_drafted_with_no_transaction_open(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        session_id = await self._active_session(user)
        seen: list[tuple[bool, int]] = []

        async def _rewrite_call(**_: object) -> dict[str, Any]:
            seen.append((db.in_transaction(), app_engine.pool.checkedout()))
            return _rewrite("- the second line, tighter")

        with patch.object(rewrite_service, "run_rewrite", side_effect=_rewrite_call):
            async with await as_user(user) as authed:
                resp = await authed.post(f"/resume-refinement/sessions/{session_id}/skip", json={})

        assert resp.status_code == 200, resp.text
        assert resp.json()["pending_proposal"] == "- the second line, tighter"
        assert seen == [(False, 0)]

    @pytest.mark.asyncio
    async def test_a_suggestion_for_a_position_the_user_left_is_not_saved(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        session_id = await self._active_session(user)

        async def _rewrite_while_the_user_goes_back(**_: object) -> dict[str, Any]:
            # Another tab steps back to the first suggestion: only the
            # position moves, served from the cache with no new turn.
            await _navigate_back(user, session_id)
            return _rewrite("- the second line, tighter")

        with patch.object(rewrite_service, "run_rewrite", side_effect=_rewrite_while_the_user_goes_back):
            async with await as_user(user) as authed:
                resp = await authed.post(f"/resume-refinement/sessions/{session_id}/skip", json={})

        assert resp.status_code == 200, resp.text
        session = await _session(session_id)
        assert session.target_index == 0
        assert session.pending_proposal == "- the first line, tighter"
        assert "1" not in session.proposal_cache
        assert await _proposal_turns(session_id) == 0

    @pytest.mark.asyncio
    async def test_a_request_made_while_a_suggestion_is_saved_waits_for_all_of_it(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        session_id = await self._active_session(user)
        second = _SecondRequestDuring("ai_proposal", lambda: _navigate_back(user, session_id))

        with (
            patch.object(rewrite_service, "run_rewrite", return_value=_rewrite("- the second line, tighter")),
            patch.object(turn_repo, "append", side_effect=second.append),
        ):
            async with await as_user(user) as authed:
                resp = await authed.post(f"/resume-refinement/sessions/{session_id}/skip", json={})
            await second.finished()

        assert resp.status_code == 200, resp.text
        assert second.got_through is False
        session = await _session(session_id)
        # The step back ran after the whole suggestion was saved.
        assert session.target_index == 0
        assert session.proposal_cache["1"]["proposal"] == "- the second line, tighter"
        assert await _proposal_turns(session_id) == 1
