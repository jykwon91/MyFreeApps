"""Tests for the async session-start flow (background preparation).

POST /resume-refinement/sessions used to run critique + all-targets
prefetch synchronously — a 1-2 minute blocking request. Now:

  * ``start_session`` creates the session in ``preparing`` and returns
    WITHOUT any Claude call.
  * ``prepare_session`` (worker-side) runs critique → prefetch →
    hydrates the first target → unlocks (``active``). Idempotent on
    retry; gates the unlock on real first-target content; special-cases
    the zero-target session.
  * ``retry_preparation`` re-queues a ``failed`` session only.

All tests mock the DB-coupled repository functions and Claude-coupled
services — same approach as test_resume_refinement_proposal_cache.py.
Patches target the CONSUMER module's namespace for by-name imports
(session_lifecycle_service), and shared module objects for repo/service
references.
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.resume_refinement import (
    session_lifecycle_service,
    session_service,
)
from app.services.resume_refinement.errors import (
    PreparationFailed,
    SessionNotActive,
)


def _fake_session(
    *,
    status: str = "preparing",
    targets: list[dict] | None = None,
    pending_proposal: str | None = None,
    pending_clarifying_question: str | None = None,
):
    s = MagicMock(spec=[])
    s.id = uuid.uuid4()
    s.user_id = uuid.uuid4()
    s.status = status
    s.improvement_targets = targets
    s.target_index = 0
    s.current_draft = "## Resume\n- old text"
    s.proposal_cache = {}
    s.pending_target_section = None
    s.pending_proposal = pending_proposal
    s.pending_rationale = None
    s.pending_clarifying_question = pending_clarifying_question
    s.pending_guard_flagged = None
    s.pending_flagged_proposal = None
    s.confirmed_facts = []
    s.guard_flag_counts = {}
    s.total_tokens_in = 0
    s.total_tokens_out = 0
    s.total_cost_usd = Decimal("0")
    s.turn_count = 0
    s.error_message = None
    s.preparation_started_at = None
    return s


def _target(section: str = "summary") -> dict:
    return {
        "section": section,
        "current_text": "old text",
        "improvement_type": "tighten_phrasing",
        "severity": "medium",
        "notes": None,
    }


def _critique(targets: list[dict]) -> dict:
    return {
        "targets": targets,
        "input_tokens": 500,
        "output_tokens": 200,
        "cost_usd": Decimal("0.004"),
    }


def _mock_db() -> MagicMock:
    db = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db


# ---------------------------------------------------------------------------
# start_session — fast return, no Claude
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_start_session_returns_preparing_without_claude() -> None:
    """Session creation must NOT run critique or prefetch — that's the
    entire point of the async flow."""
    db = _mock_db()
    job = MagicMock()
    job.status = "complete"
    job.result_parsed_fields = None
    created = _fake_session(status="preparing")
    create_kwargs: list[dict] = []

    async def fake_create(_db, **kwargs):
        create_kwargs.append(kwargs)
        return created

    with (
        patch.object(
            session_service.resume_upload_job_repo,
            "get_by_id_for_user",
            new=AsyncMock(return_value=job),
        ),
        patch.object(
            session_service.profile_repository,
            "get_by_user_id",
            new=AsyncMock(return_value=None),
        ),
        patch.object(
            session_service.work_history_repository,
            "list_by_user",
            new=AsyncMock(return_value=[]),
        ),
        patch.object(
            session_service.education_repository,
            "list_by_user",
            new=AsyncMock(return_value=[]),
        ),
        patch.object(
            session_service.skill_repository,
            "list_by_user",
            new=AsyncMock(return_value=[]),
        ),
        patch.object(session_service.session_repo, "create", new=fake_create),
        patch.object(
            session_lifecycle_service,
            "_with_turns",
            new=AsyncMock(return_value=created),
        ),
        patch.object(
            session_service.critique_service,
            "run_critique",
            new=AsyncMock(side_effect=AssertionError("critique must NOT run")),
        ),
        patch.object(
            session_lifecycle_service,
            "_prefetch_all_proposals",
            new=AsyncMock(side_effect=AssertionError("prefetch must NOT run")),
        ),
    ):
        result = await session_lifecycle_service.start_session(
            db=db,
            user_id=created.user_id,
            source_resume_job_id=uuid.uuid4(),
        )

    assert result is created
    assert create_kwargs[0]["status"] == "preparing"


# ---------------------------------------------------------------------------
# prepare_session — worker-side flow
# ---------------------------------------------------------------------------


def _prepare_patches(session, *, critique_mock, prefetch_mock, hydrated, generated=None):
    """Common patch set for prepare_session tests."""
    marked_active: list[bool] = []

    async def fake_update_critique(_db, sess, *, improvement_targets, **_):
        sess.improvement_targets = improvement_targets
        return sess

    async def fake_mark_active(_db, sess):
        marked_active.append(True)
        sess.status = "active"
        return sess

    patches = (
        patch.object(
            session_service.critique_service, "run_critique", new=critique_mock,
        ),
        patch.object(
            session_service.session_repo, "update_critique", new=fake_update_critique,
        ),
        patch.object(session_service.turn_repo, "append", new=AsyncMock()),
        patch.object(
            session_lifecycle_service, "_prefetch_all_proposals", new=prefetch_mock,
        ),
        patch.object(
            session_service.session_repo,
            "hydrate_pending_from_cache",
            new=AsyncMock(return_value=hydrated),
        ),
        patch.object(
            session_lifecycle_service,
            "_generate_next_proposal",
            new=AsyncMock(return_value=generated or session),
        ),
        patch.object(
            session_service.session_repo, "mark_active", new=fake_mark_active,
        ),
    )
    return patches, marked_active


@pytest.mark.asyncio
async def test_prepare_session_happy_path_unlocks() -> None:
    session = _fake_session(targets=None)
    db = _mock_db()
    hydrated = _fake_session(
        targets=[_target()], pending_proposal="drafted text",
    )
    critique_mock = AsyncMock(return_value=_critique([_target()]))
    prefetch_mock = AsyncMock(return_value=session)

    patches, marked_active = _prepare_patches(
        session,
        critique_mock=critique_mock,
        prefetch_mock=prefetch_mock,
        hydrated=hydrated,
    )
    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6]:
        result = await session_lifecycle_service.prepare_session(
            db=db, session=session, user_id=session.user_id,
        )

    critique_mock.assert_awaited_once()
    prefetch_mock.assert_awaited_once()
    assert marked_active == [True]
    assert result.status == "active"


@pytest.mark.asyncio
async def test_prepare_session_skips_critique_on_retry() -> None:
    """Retry idempotency: targets already persisted → critique is NOT
    re-spent; preparation resumes from the prefetch."""
    session = _fake_session(targets=[_target()])
    db = _mock_db()
    hydrated = _fake_session(
        targets=[_target()], pending_proposal="drafted text",
    )
    critique_mock = AsyncMock(side_effect=AssertionError("critique must NOT re-run"))
    prefetch_mock = AsyncMock(return_value=session)

    patches, marked_active = _prepare_patches(
        session,
        critique_mock=critique_mock,
        prefetch_mock=prefetch_mock,
        hydrated=hydrated,
    )
    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6]:
        await session_lifecycle_service.prepare_session(
            db=db, session=session, user_id=session.user_id,
        )

    prefetch_mock.assert_awaited_once()
    assert marked_active == [True]


@pytest.mark.asyncio
async def test_prepare_session_zero_targets_unlocks_immediately() -> None:
    """0 targets → straight to active. Waiting for a 'first proposal'
    would spin forever (there is no target 0)."""
    session = _fake_session(targets=None)
    db = _mock_db()
    critique_mock = AsyncMock(return_value=_critique([]))
    prefetch_mock = AsyncMock(side_effect=AssertionError("prefetch must NOT run"))

    patches, marked_active = _prepare_patches(
        session,
        critique_mock=critique_mock,
        prefetch_mock=prefetch_mock,
        hydrated=None,
    )
    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6]:
        result = await session_lifecycle_service.prepare_session(
            db=db, session=session, user_id=session.user_id,
        )

    assert marked_active == [True]
    assert result.status == "active"


@pytest.mark.asyncio
async def test_prepare_session_gates_unlock_on_first_target_content() -> None:
    """Cache miss + failed generation → PreparationFailed, NOT a silent
    unlock into a permanently-stuck 'working on a suggestion' state."""
    session = _fake_session(targets=[_target()])
    db = _mock_db()
    critique_mock = AsyncMock(side_effect=AssertionError("targets already set"))
    prefetch_mock = AsyncMock(return_value=session)

    # hydrate misses; generation returns the session with NO pending
    # content (mirrors the graceful-degrade path in _generate_next_proposal).
    patches, marked_active = _prepare_patches(
        session,
        critique_mock=critique_mock,
        prefetch_mock=prefetch_mock,
        hydrated=None,
        generated=session,
    )
    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6]:
        with pytest.raises(PreparationFailed):
            await session_lifecycle_service.prepare_session(
                db=db, session=session, user_id=session.user_id,
            )

    assert marked_active == []


# ---------------------------------------------------------------------------
# retry_preparation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_retry_preparation_requeues_failed_session() -> None:
    session = _fake_session(status="failed")
    db = _mock_db()
    reset_calls: list[bool] = []

    async def fake_reset(_db, sess):
        reset_calls.append(True)
        sess.status = "preparing"
        return sess

    with (
        patch.object(
            session_service.session_repo,
            "get_by_id_for_user",
            new=AsyncMock(return_value=session),
        ),
        patch.object(session_service.session_repo, "reset_for_retry", new=fake_reset),
        patch.object(
            session_lifecycle_service,
            "_with_turns",
            new=AsyncMock(return_value=session),
        ),
    ):
        result = await session_lifecycle_service.retry_preparation(
            db=db, user_id=session.user_id, session_id=session.id,
        )

    assert reset_calls == [True]
    assert result.status == "preparing"


@pytest.mark.asyncio
async def test_retry_preparation_rejects_non_failed_session() -> None:
    session = _fake_session(status="active")
    db = _mock_db()

    with patch.object(
        session_service.session_repo,
        "get_by_id_for_user",
        new=AsyncMock(return_value=session),
    ):
        with pytest.raises(SessionNotActive):
            await session_lifecycle_service.retry_preparation(
                db=db, user_id=session.user_id, session_id=session.id,
            )
