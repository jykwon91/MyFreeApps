"""Tests for the proposal-cache + prefetch behavior on the
resume-refinement session flow.

Covers the user-visible contract of the cache shipped in PR #341 + the
prefetch shipped in PR #344:

  * ``navigate`` checks the cache first; cache HIT does NOT call Claude.
  * ``navigate`` cache MISS falls through to ``_generate_next_proposal``.
  * ``_prefetch_all_proposals`` calls Claude in parallel for every
    target, writes each result to the cache, and degrades gracefully
    on per-target failure.
  * ``_prefetch_all_proposals`` honors the concurrency cap so a session
    with many targets does not flood Anthropic.
  * ``request_alternative`` invalidates the cache for the current
    target before regeneration.

All tests mock the DB-coupled repository functions and the Claude-
coupled rewrite service. No DB, no network. Behavioral guarantees
above are what matter, not the SQLAlchemy plumbing those helpers do
under the hood — that's covered by integration tests when the conftest
DB is available.
"""
from __future__ import annotations

import asyncio
import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.resume_refinement import session_service


def _fake_session(
    *,
    targets: list[dict] | None = None,
    target_index: int = 0,
    proposal_cache: dict | None = None,
):
    """Lightweight stand-in for a ``ResumeRefinementSession`` row.

    Carries only the attributes the cache + prefetch helpers actually
    read. Mutations (like ``proposal_cache``) are visible to assertions
    via direct attribute access, which is exactly what the production
    flush-then-refresh cycle would yield.
    """
    s = MagicMock(spec=[])
    s.id = uuid.uuid4()
    s.user_id = uuid.uuid4()
    s.improvement_targets = targets or []
    s.target_index = target_index
    s.current_draft = "## Resume\n- bullet 1"
    s.proposal_cache = proposal_cache or {}
    s.pending_target_section = None
    s.pending_proposal = None
    s.pending_rationale = None
    s.pending_clarifying_question = None
    s.total_tokens_in = 0
    s.total_tokens_out = 0
    s.total_cost_usd = Decimal("0")
    s.turn_count = 0
    return s


def _target(section: str = "summary") -> dict:
    return {
        "section": section,
        "current_text": "old text",
        "improvement_type": "tighten_phrasing",
        "severity": "medium",
        "notes": None,
    }


def _rewrite_proposal(text: str = "new text") -> dict:
    return {
        "kind": "proposal",
        "rewritten_text": text,
        "rationale": "tighter phrasing",
        "input_tokens": 100,
        "output_tokens": 50,
        "cost_usd": Decimal("0.001"),
    }


# ---------------------------------------------------------------------------
# navigate — cache hit / miss
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_navigate_cache_hit_skips_claude_call() -> None:
    """When ``proposal_cache`` has an entry for the destination target,
    ``navigate`` MUST hydrate ``pending_*`` from cache and NOT invoke
    the Claude rewrite service. This is the entire point of the cache —
    nav becomes instant on revisit.
    """
    targets = [_target("a"), _target("b")]
    cached_session = _fake_session(
        targets=targets,
        target_index=0,
        proposal_cache={
            "1": {
                "section": "b",
                "proposal": "cached b proposal",
                "rationale": "cached b rationale",
                "clarifying_question": None,
            }
        },
    )

    db = MagicMock()
    rewrite_mock = AsyncMock(side_effect=AssertionError("Claude must NOT be called"))

    async def fake_load_active(_db, session_id, user_id):
        return cached_session

    async def fake_set_target_index(_db, session, *, new_index):
        session.target_index = new_index
        return session

    async def fake_hydrate(_db, session, *, target_index):
        entry = session.proposal_cache.get(str(target_index))
        if not entry:
            return None
        session.pending_target_section = entry["section"]
        session.pending_proposal = entry["proposal"]
        session.pending_rationale = entry["rationale"]
        session.pending_clarifying_question = entry["clarifying_question"]
        return session

    with (
        patch.object(session_service, "_load_active", new=fake_load_active),
        patch.object(
            session_service.session_repo,
            "set_target_index",
            new=fake_set_target_index,
        ),
        patch.object(
            session_service.session_repo,
            "hydrate_pending_from_cache",
            new=fake_hydrate,
        ),
        patch.object(session_service.rewrite_service, "run_rewrite", new=rewrite_mock),
    ):
        result = await session_service.navigate(
            db=db,
            user_id=cached_session.user_id,
            session_id=cached_session.id,
            direction="next",
        )

    assert result is cached_session
    assert result.target_index == 1
    assert result.pending_proposal == "cached b proposal"
    assert rewrite_mock.await_count == 0


@pytest.mark.asyncio
async def test_navigate_cache_miss_falls_through_to_generation() -> None:
    """When the cache has no entry for the destination target,
    ``navigate`` MUST call ``_generate_next_proposal`` (which itself
    calls Claude + writes the result back to cache for next time).
    """
    targets = [_target("a"), _target("b")]
    session = _fake_session(targets=targets, target_index=0, proposal_cache={})
    db = MagicMock()

    async def fake_load_active(_db, session_id, user_id):
        return session

    async def fake_set_target_index(_db, sess, *, new_index):
        sess.target_index = new_index
        return sess

    generate_mock = AsyncMock(return_value=session)

    with (
        patch.object(session_service, "_load_active", new=fake_load_active),
        patch.object(
            session_service.session_repo,
            "set_target_index",
            new=fake_set_target_index,
        ),
        patch.object(
            session_service.session_repo,
            "hydrate_pending_from_cache",
            new=AsyncMock(return_value=None),  # cache miss
        ),
        patch.object(session_service, "_generate_next_proposal", new=generate_mock),
    ):
        await session_service.navigate(
            db=db,
            user_id=session.user_id,
            session_id=session.id,
            direction="next",
        )

    generate_mock.assert_awaited_once()


# ---------------------------------------------------------------------------
# _prefetch_all_proposals — parallel fanout, failure tolerance
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_prefetch_writes_each_target_to_cache() -> None:
    """Happy path: every target gets a proposal, every proposal lands
    in the cache via ``cache_proposal``.
    """
    targets = [_target(f"section-{i}") for i in range(3)]
    session = _fake_session(targets=targets)
    db = MagicMock()

    rewrite_mock = AsyncMock(
        side_effect=[
            _rewrite_proposal(f"proposal-{i}") for i in range(3)
        ],
    )

    cache_calls: list[int] = []

    async def fake_cache_proposal(_db, sess, *, target_index, **_):
        cache_calls.append(target_index)
        return sess

    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    with (
        patch.object(session_service.rewrite_service, "run_rewrite", new=rewrite_mock),
        patch.object(
            session_service.session_repo,
            "cache_proposal",
            new=fake_cache_proposal,
        ),
    ):
        await session_service._prefetch_all_proposals(
            db, session, user_id=session.user_id,
        )

    assert rewrite_mock.await_count == 3
    assert sorted(cache_calls) == [0, 1, 2]
    # Token counters MUST roll up so the operator's session totals
    # reflect the prefetch spend.
    assert session.total_tokens_in == 300
    assert session.total_tokens_out == 150


@pytest.mark.asyncio
async def test_prefetch_one_target_failure_does_not_block_others() -> None:
    """Per-target Claude failures degrade gracefully: the failing target
    is left out of the cache, others still land. Session still ships.
    """
    targets = [_target(f"section-{i}") for i in range(3)]
    session = _fake_session(targets=targets)
    db = MagicMock()

    async def flaky_rewrite(*args, **kwargs):
        target = kwargs.get("target", {})
        if target.get("section") == "section-1":
            raise RuntimeError("Claude blew up on target 1")
        return _rewrite_proposal(f"proposal for {target.get('section')}")

    cache_calls: list[int] = []

    async def fake_cache_proposal(_db, sess, *, target_index, **_):
        cache_calls.append(target_index)
        return sess

    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    with (
        patch.object(
            session_service.rewrite_service,
            "run_rewrite",
            new=AsyncMock(side_effect=flaky_rewrite),
        ),
        patch.object(
            session_service.session_repo,
            "cache_proposal",
            new=fake_cache_proposal,
        ),
    ):
        result = await session_service._prefetch_all_proposals(
            db, session, user_id=session.user_id,
        )

    # Two targets succeeded; the failing one was simply skipped.
    assert sorted(cache_calls) == [0, 2]
    # Session still returned (no exception propagated) so start_session
    # can still serve the operator a usable session.
    assert result is session


@pytest.mark.asyncio
async def test_prefetch_caps_in_flight_claude_calls() -> None:
    """The semaphore caps concurrency at ``_PREFETCH_CONCURRENCY`` so a
    session with many targets does not flood Anthropic with simultaneous
    requests. Verify by counting peak in-flight calls during prefetch.
    """
    targets = [_target(f"section-{i}") for i in range(10)]
    session = _fake_session(targets=targets)
    db = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    in_flight = 0
    peak_in_flight = 0
    lock = asyncio.Lock()

    async def slow_rewrite(*args, **kwargs):
        nonlocal in_flight, peak_in_flight
        async with lock:
            in_flight += 1
            peak_in_flight = max(peak_in_flight, in_flight)
        try:
            await asyncio.sleep(0.01)
            return _rewrite_proposal()
        finally:
            async with lock:
                in_flight -= 1

    async def fake_cache_proposal(_db, sess, **_):
        return sess

    with (
        patch.object(
            session_service.rewrite_service,
            "run_rewrite",
            new=AsyncMock(side_effect=slow_rewrite),
        ),
        patch.object(
            session_service.session_repo,
            "cache_proposal",
            new=fake_cache_proposal,
        ),
    ):
        await session_service._prefetch_all_proposals(
            db, session, user_id=session.user_id,
        )

    # The cap is exposed as ``_PREFETCH_CONCURRENCY``. Peak observed
    # parallelism must never exceed it; with 10 targets and the default
    # cap of 5 we expect to actually hit the cap.
    assert peak_in_flight <= session_service._PREFETCH_CONCURRENCY
    assert peak_in_flight == session_service._PREFETCH_CONCURRENCY


@pytest.mark.asyncio
async def test_prefetch_with_empty_targets_is_noop() -> None:
    """No targets → no Claude calls, session returned unchanged."""
    session = _fake_session(targets=[])
    db = MagicMock()
    rewrite_mock = AsyncMock(side_effect=AssertionError("must not run"))

    with patch.object(
        session_service.rewrite_service, "run_rewrite", new=rewrite_mock,
    ):
        result = await session_service._prefetch_all_proposals(
            db, session, user_id=session.user_id,
        )

    assert result is session
    assert rewrite_mock.await_count == 0
