"""Accept, accept-flagged, write-my-own and skip act on the suggestion the user saw.

They act on whatever is pending on the server. A client a step behind (a
second tap before the next suggestion reached the screen, or a retry after a
lost answer) used to apply the NEXT suggestion, which the user never saw.
Now the client says which suggestion it was showing (``seen_target_index`` /
``seen_turn_count``) and the server refuses with a coded 409 when the session
has moved on, changing nothing.

The answer loads the session row with ``SELECT ... FOR UPDATE`` and holds the
lock until it commits the advance, so two answers in flight at once serialize
and the second is refused rather than applying the next suggestion.

The first two classes need no database; the rest run the real service and
routes against the test database with only Claude mocked.
"""
from __future__ import annotations

import asyncio
import uuid
from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.resume_refinement_conflicts import (
    SUGGESTION_CHANGED_CODE,
    SUGGESTION_CHANGED_MESSAGE,
)
from app.models.resume_refinement.session import ResumeRefinementSession
from app.repositories.resume_refinement import session_repo, turn_repo
from app.services.resume_refinement import session_service, session_turn_service
from app.services.resume_refinement.errors import SuggestionChanged
from app.services.resume_refinement.seen_suggestion_check import (
    ensure_seen_suggestion_is_current,
)

_FIRST = "Led a team."
_SECOND = "Wrote docs."
_THIRD = "Ran on-call."
_DRAFT = f"## Experience\n- {_FIRST}\n- {_SECOND}\n- {_THIRD}"
_SHOWN = "Led a team of five engineers."


def _target(section: str, current_text: str) -> dict[str, Any]:
    return {
        "section": section,
        "current_text": current_text,
        "improvement_type": "tighten_phrasing",
        "severity": "medium",
        "notes": None,
    }


def _rewrite() -> AsyncMock:
    return AsyncMock(return_value={
        "kind": "proposal",
        "rewritten_text": "freshly generated",
        "rationale": "why",
        "question": None,
        "hallucination_flagged": [],
        "input_tokens": 1,
        "output_tokens": 1,
        "cost_usd": Decimal("0"),
    })


def _patch_rewrite(mock: AsyncMock) -> Any:
    return patch(
        "app.services.resume_refinement.session_helpers.rewrite_service.run_rewrite",
        new=mock,
    )


async def _session(
    db: AsyncSession, user: dict[str, Any], *, flagged: list[str] | None = None,
) -> ResumeRefinementSession:
    """An active session for ``user`` showing ``_SHOWN`` for the first of three targets.

    ``flagged`` is what the guard held the suggestion for, so "Use it anyway" confirms it.
    """
    user_id = uuid.UUID(user["id"])
    session = await session_repo.create(
        db, user_id=user_id, source_resume_job_id=None, initial_draft=_DRAFT,
    )
    session.improvement_targets = [
        _target("exp", _FIRST), _target("docs", _SECOND), _target("oncall", _THIRD),
    ]
    session.pending_target_section = "exp"
    session.pending_proposal = _SHOWN
    session.pending_flagged_proposal = _SHOWN
    session.pending_guard_flagged = flagged
    session.turn_count = 4
    await db.commit()
    await db.refresh(session)
    return session


class TestEnsureSeenSuggestionIsCurrent:
    def _session(self) -> ResumeRefinementSession:
        return ResumeRefinementSession(target_index=2, turn_count=7)

    def test_matching_position_passes(self) -> None:
        ensure_seen_suggestion_is_current(self._session(), seen_target_index=2, seen_turn_count=7)

    def test_nothing_sent_is_not_checked(self) -> None:
        ensure_seen_suggestion_is_current(self._session(), seen_target_index=None, seen_turn_count=None)

    def test_another_target_is_refused(self) -> None:
        with pytest.raises(SuggestionChanged):
            ensure_seen_suggestion_is_current(self._session(), seen_target_index=1, seen_turn_count=7)

    def test_a_regenerated_suggestion_is_refused(self) -> None:
        with pytest.raises(SuggestionChanged):
            ensure_seen_suggestion_is_current(self._session(), seen_target_index=2, seen_turn_count=6)


class _Stop(Exception):
    """Raised by the stubbed load so a test sees how the session was loaded and nothing else."""


_ANSWERS = {
    "accept": lambda **kw: session_service.accept_pending(**kw),
    "accept_flagged": lambda **kw: session_service.accept_flagged(**kw),
    "custom": lambda **kw: session_service.accept_custom(user_text="My own words.", **kw),
    "skip": lambda **kw: session_service.skip_target(**kw),
}
# Every write that says which suggestion it was for: the answers, and "Another option" / a clarify reply.
_SEEN_WRITES = {
    **_ANSWERS,
    "alternative": lambda **kw: session_service.request_alternative(hint="Yes, that's right.", **kw),
}
# Writes that move the cursor without answering.
_MOVES = {
    "navigate": lambda **kw: session_service.navigate(direction="next", **kw),
    "target_from_line": lambda **kw: session_service.create_target_from_line(
        current_text=_SECOND, section="docs", **kw,
    ),
}


class TestWritesLockTheSession:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("write", list(_SEEN_WRITES))
    async def test_a_seen_write_loads_the_session_with_its_row_lock(self, write: str) -> None:
        load = AsyncMock(side_effect=_Stop())
        with patch.object(session_turn_service, "_load_active", new=load), pytest.raises(_Stop):
            await _SEEN_WRITES[write](
                db=AsyncMock(), user_id=uuid.uuid4(), session_id=uuid.uuid4(),
                seen_target_index=0, seen_turn_count=0,
            )
        assert load.await_args is not None
        assert load.await_args.kwargs == {"for_update": True}

    @pytest.mark.asyncio
    @pytest.mark.parametrize("move", list(_MOVES))
    async def test_a_move_loads_the_session_with_its_row_lock(self, move: str) -> None:
        load = AsyncMock(side_effect=_Stop())
        with patch.object(session_turn_service, "_load_active", new=load), pytest.raises(_Stop):
            await _MOVES[move](db=AsyncMock(), user_id=uuid.uuid4(), session_id=uuid.uuid4())
        assert load.await_args is not None
        assert load.await_args.kwargs == {"for_update": True}


class TestServiceRefusesAStaleAnswer:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("answer", list(_SEEN_WRITES))
    async def test_an_answer_to_a_suggestion_already_answered_changes_nothing(
        self, answer: str, db: AsyncSession, user_factory: Any,
    ) -> None:
        user = await user_factory()
        user_id, session = uuid.UUID(user["id"]), await _session(db, user)
        seen_turn_count = session.turn_count
        rewrite = _rewrite()
        with _patch_rewrite(rewrite):
            # The first answer lands and the session moves to the next suggestion.
            moved = await session_service.skip_target(db=db, user_id=user_id, session_id=session.id)
            draft, index, turns = moved.current_draft, moved.target_index, moved.turn_count

            # The client is a step behind: it answers what it was still showing.
            with pytest.raises(SuggestionChanged):
                await _SEEN_WRITES[answer](
                    db=db, user_id=user_id, session_id=session.id,
                    seen_target_index=0, seen_turn_count=seen_turn_count,
                )

        await db.refresh(moved)
        assert (moved.current_draft, moved.target_index, moved.turn_count) == (draft, index, turns)
        assert rewrite.await_count == 1  # only the first answer's next suggestion

    @pytest.mark.asyncio
    @pytest.mark.parametrize("answer", list(_ANSWERS))
    async def test_an_answer_to_the_suggestion_on_screen_goes_through(
        self, answer: str, db: AsyncSession, user_factory: Any,
    ) -> None:
        user = await user_factory()
        user_id, session = uuid.UUID(user["id"]), await _session(db, user)
        with _patch_rewrite(_rewrite()):
            result = await _ANSWERS[answer](
                db=db, user_id=user_id, session_id=session.id,
                seen_target_index=session.target_index, seen_turn_count=session.turn_count,
            )
        assert result.target_index == 1

    @pytest.mark.asyncio
    async def test_a_clarify_reply_to_the_suggestion_on_screen_confirms_its_facts(
        self, db: AsyncSession, user_factory: Any,
    ) -> None:
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        session = await _session(db, user, flagged=["five engineers"])
        with _patch_rewrite(_rewrite()):
            result = await _SEEN_WRITES["alternative"](
                db=db, user_id=user_id, session_id=session.id,
                seen_target_index=0, seen_turn_count=session.turn_count,
            )
        assert result.target_index == 0
        assert result.confirmed_facts == ["five engineers"]

    @pytest.mark.asyncio
    async def test_a_stale_clarify_reply_confirms_nothing(
        self, db: AsyncSession, user_factory: Any,
    ) -> None:
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        session = await _session(db, user, flagged=["five engineers"])
        with _patch_rewrite(_rewrite()), pytest.raises(SuggestionChanged):
            await _SEEN_WRITES["alternative"](
                db=db, user_id=user_id, session_id=session.id,
                seen_target_index=0, seen_turn_count=session.turn_count - 1,
            )
        await db.refresh(session)
        assert not session.confirmed_facts
        assert session.pending_guard_flagged == ["five engineers"]


class TestUseItAnywayIsOneTransaction:
    @pytest.mark.asyncio
    async def test_a_failure_before_the_commit_leaves_the_session_as_it_was(
        self, db: AsyncSession, db_engine: AsyncEngine, user_factory: Any,
    ) -> None:
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        session = await _session(db, user, flagged=["five engineers"])
        session_id = session.id
        failing_turn = AsyncMock(side_effect=RuntimeError("turn row failed"))
        with (
            _patch_rewrite(_rewrite()),
            patch.object(session_turn_service.turn_repo, "append", new=failing_turn),
            pytest.raises(RuntimeError),
        ):
            await session_service.accept_flagged(
                db=db, user_id=user_id, session_id=session.id,
                seen_target_index=0, seen_turn_count=session.turn_count,
            )
        await db.rollback()

        async with async_sessionmaker(db_engine, expire_on_commit=False)() as fresh:
            stored = await session_repo.get_by_id_for_user(fresh, session_id, user_id)
        assert stored is not None
        assert (stored.target_index, stored.current_draft) == (0, _DRAFT)
        assert not stored.confirmed_facts
        assert stored.pending_flagged_proposal == _SHOWN


class TestAnswersInFlightAtOnceSerialize:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("answer", list(_SEEN_WRITES))
    async def test_a_second_answer_waits_for_use_it_anyway_then_is_refused(
        self, answer: str, db: AsyncSession, db_engine: AsyncEngine, user_factory: Any,
    ) -> None:
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        session = await _session(db, user, flagged=["five engineers"])
        seen = {"seen_target_index": 0, "seen_turn_count": session.turn_count}
        sessions = async_sessionmaker(db_engine, expire_on_commit=False)
        holding, release = asyncio.Event(), asyncio.Event()
        real_append = turn_repo.append

        async def append_once_released(db: AsyncSession, **kwargs: Any) -> Any:
            # "Use it anyway" is mid-write, holding the row lock, until the test lets it go on.
            holding.set()
            await release.wait()
            return await real_append(db, **kwargs)

        async with sessions() as first, sessions() as second:
            with (
                _patch_rewrite(_rewrite()),
                patch.object(session_turn_service.turn_repo, "append", new=append_once_released),
            ):
                use_it_anyway = asyncio.create_task(session_service.accept_flagged(
                    db=first, user_id=user_id, session_id=session.id, **seen,
                ))
                await asyncio.wait_for(holding.wait(), timeout=5)

                # A second answer to the same suggestion arrives while the first is in flight.
                other = asyncio.create_task(_SEEN_WRITES[answer](
                    db=second, user_id=user_id, session_id=session.id, **seen,
                ))
                await asyncio.sleep(0.3)
                assert not other.done(), "the second answer read the session while the first held it"

                # "Use it anyway" commits, which lets the second answer read the
                # new position: it is refused. Its request then ends, releasing
                # the row, and "Use it anyway" goes on to its next suggestion.
                release.set()
                with pytest.raises(SuggestionChanged):
                    await asyncio.wait_for(other, timeout=5)
                await second.rollback()
                await asyncio.wait_for(use_it_anyway, timeout=5)

        await db.refresh(session)
        assert session.target_index == 1  # advanced once, by "Use it anyway" only
        assert _SHOWN in session.current_draft
        assert session.confirmed_facts == ["five engineers"]
        roles = [turn.role for turn in await turn_repo.list_for_session(db, session.id)]
        assert roles.count("user_accept_flagged") == 1
        assert not {"user_accept", "user_custom", "user_skip", "user_request_alternative"} & set(roles)


class TestRoutes:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("path,body", [
        ("accept", {}),
        ("accept-flagged", {}),
        ("custom", {"user_text": "My own words."}),
        ("skip", {}),
        ("alternative", {"hint": "Yes, that's right."}),
    ])
    async def test_a_stale_answer_gets_the_coded_409(
        self, path: str, body: dict[str, Any], db: AsyncSession, user_factory: Any, as_user: Any,
    ) -> None:
        user = await user_factory()
        session = await _session(db, user)
        stale = {**body, "seen_target_index": 0, "seen_turn_count": session.turn_count - 1}
        with _patch_rewrite(_rewrite()):
            async with await as_user(user) as authed:
                resp = await authed.post(f"/resume-refinement/sessions/{session.id}/{path}", json=stale)
        assert resp.status_code == 409
        assert resp.json()["detail"] == {
            "code": SUGGESTION_CHANGED_CODE,
            "message": SUGGESTION_CHANGED_MESSAGE,
        }
        await db.refresh(session)
        assert session.target_index == 0
        assert session.pending_proposal == _SHOWN

    @pytest.mark.asyncio
    async def test_a_client_that_sends_no_position_still_works(
        self, db: AsyncSession, user_factory: Any, as_user: Any,
    ) -> None:
        user = await user_factory()
        session = await _session(db, user)
        with _patch_rewrite(_rewrite()):
            async with await as_user(user) as authed:
                resp = await authed.post(f"/resume-refinement/sessions/{session.id}/accept")
        assert resp.status_code == 200
        assert resp.json()["target_index"] == 1
        assert _SHOWN in resp.json()["current_draft"]

    @pytest.mark.asyncio
    async def test_the_answer_to_the_suggestion_on_screen_goes_through(
        self, db: AsyncSession, user_factory: Any, as_user: Any,
    ) -> None:
        user = await user_factory()
        session = await _session(db, user)
        seen = {"seen_target_index": 0, "seen_turn_count": session.turn_count}
        with _patch_rewrite(_rewrite()):
            async with await as_user(user) as authed:
                resp = await authed.post(f"/resume-refinement/sessions/{session.id}/accept", json=seen)
        assert resp.status_code == 200
        assert _SHOWN in resp.json()["current_draft"]
