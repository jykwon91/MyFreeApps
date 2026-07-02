"""Tests for the hallucination-guard confirmation loop fix.

The production dead-end: the guard re-checked every regenerated
proposal against the UNCHANGED source resume, so answering "yes,
that's correct" could never unblock — the same phrase re-flagged and
the identical canned question returned, burning a Claude call per
retry. Three behaviors close the loop:

1. Answering a guard-generated clarify records the flagged phrases as
   session-level confirmed facts (``request_alternative``).
2. Generation passes the allowlist + per-target flag count into the
   rewrite service, and persists guard state on the pending fields
   (``_generate_next_proposal``).
3. "Use it anyway" applies the guard-held proposal after explicit user
   confirmation (``accept_flagged``).

All tests mock the DB-coupled repository functions and the Claude-
coupled rewrite service — same approach as
test_resume_refinement_proposal_cache.py.
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.resume_refinement import (
    session_helpers,
    session_service,
    session_turn_service,
)
from app.services.resume_refinement.errors import NoPendingProposal


def _fake_session(
    *,
    targets: list[dict] | None = None,
    target_index: int = 0,
    pending_guard_flagged: list[str] | None = None,
    pending_flagged_proposal: str | None = None,
    confirmed_facts: list[str] | None = None,
    guard_flag_counts: dict | None = None,
):
    s = MagicMock(spec=[])
    s.id = uuid.uuid4()
    s.user_id = uuid.uuid4()
    s.status = "active"
    s.improvement_targets = targets or []
    s.target_index = target_index
    s.current_draft = "## Resume\n- old text"
    s.proposal_cache = {}
    s.pending_target_section = "summary"
    s.pending_proposal = None
    s.pending_rationale = None
    s.pending_clarifying_question = None
    s.pending_guard_flagged = pending_guard_flagged
    s.pending_flagged_proposal = pending_flagged_proposal
    s.confirmed_facts = confirmed_facts or []
    s.guard_flag_counts = guard_flag_counts or {}
    s.total_tokens_in = 0
    s.total_tokens_out = 0
    s.total_cost_usd = Decimal("0")
    s.turn_count = 0
    return s


def _target(section: str = "summary") -> dict:
    return {
        "section": section,
        "current_text": "old text",
        "improvement_type": "add_metric",
        "severity": "high",
        "notes": None,
    }


def _mock_db() -> MagicMock:
    db = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db


# ---------------------------------------------------------------------------
# request_alternative — clarify answers confirm the flagged facts
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_clarify_answer_records_confirmed_facts() -> None:
    """A typed answer to a guard-generated clarify MUST land the flagged
    phrases in the session allowlist before regeneration."""
    session = _fake_session(
        targets=[_target()],
        pending_guard_flagged=["40%", "Hooli"],
    )
    db = _mock_db()
    confirmed: list[list[str]] = []

    async def fake_add_confirmed_facts(_db, sess, *, facts):
        confirmed.append(list(facts))
        sess.confirmed_facts = list(sess.confirmed_facts) + list(facts)
        return sess

    with (
        patch.object(session_turn_service, "_load_active", new=AsyncMock(return_value=session)),
        patch.object(session_turn_service, "_generate_next_proposal", new=AsyncMock(return_value=session)),
        patch.object(session_turn_service, "_with_turns", new=AsyncMock(return_value=session)),
        patch.object(session_service.session_repo, "add_confirmed_facts", new=fake_add_confirmed_facts),
        patch.object(session_service.session_repo, "invalidate_cached_proposal", new=AsyncMock(return_value=session)),
        patch.object(session_service.turn_repo, "append", new=AsyncMock()),
    ):
        await session_turn_service.request_alternative(
            db=db,
            user_id=session.user_id,
            session_id=session.id,
            hint="Yes — both of those are correct.",
        )

    assert confirmed == [["40%", "Hooli"]]


@pytest.mark.asyncio
async def test_plain_reroll_does_not_confirm_facts() -> None:
    """"Another option" with NO typed answer is a reroll, not a
    confirmation — the allowlist must not grow."""
    session = _fake_session(
        targets=[_target()],
        pending_guard_flagged=["40%"],
    )
    db = _mock_db()
    add_mock = AsyncMock(return_value=session)

    with (
        patch.object(session_turn_service, "_load_active", new=AsyncMock(return_value=session)),
        patch.object(session_turn_service, "_generate_next_proposal", new=AsyncMock(return_value=session)),
        patch.object(session_turn_service, "_with_turns", new=AsyncMock(return_value=session)),
        patch.object(session_service.session_repo, "add_confirmed_facts", new=add_mock),
        patch.object(session_service.session_repo, "invalidate_cached_proposal", new=AsyncMock(return_value=session)),
        patch.object(session_service.turn_repo, "append", new=AsyncMock()),
    ):
        await session_turn_service.request_alternative(
            db=db,
            user_id=session.user_id,
            session_id=session.id,
            hint=None,
        )

    add_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_answer_without_guard_flags_does_not_confirm() -> None:
    """A hint on an ordinary (non-guard) clarify or proposal must not
    touch the allowlist — there is nothing to confirm."""
    session = _fake_session(targets=[_target()], pending_guard_flagged=None)
    db = _mock_db()
    add_mock = AsyncMock(return_value=session)

    with (
        patch.object(session_turn_service, "_load_active", new=AsyncMock(return_value=session)),
        patch.object(session_turn_service, "_generate_next_proposal", new=AsyncMock(return_value=session)),
        patch.object(session_turn_service, "_with_turns", new=AsyncMock(return_value=session)),
        patch.object(session_service.session_repo, "add_confirmed_facts", new=add_mock),
        patch.object(session_service.session_repo, "invalidate_cached_proposal", new=AsyncMock(return_value=session)),
        patch.object(session_service.turn_repo, "append", new=AsyncMock()),
    ):
        await session_turn_service.request_alternative(
            db=db,
            user_id=session.user_id,
            session_id=session.id,
            hint="make it more concise",
        )

    add_mock.assert_not_awaited()


# ---------------------------------------------------------------------------
# accept_flagged — "Use it anyway"
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_accept_flagged_applies_held_proposal_and_confirms() -> None:
    session = _fake_session(
        targets=[_target()],
        pending_guard_flagged=["40%"],
        pending_flagged_proposal="new text with 40% improvement",
    )
    db = _mock_db()
    confirmed: list[list[str]] = []
    applied: dict = {}
    turns: list[dict] = []

    async def fake_add_confirmed_facts(_db, sess, *, facts):
        confirmed.append(list(facts))
        return sess

    async def fake_apply_user_resolution(_db, sess, *, new_draft, advance_target):
        applied["new_draft"] = new_draft
        applied["advance_target"] = advance_target
        sess.current_draft = new_draft
        return sess

    async def fake_turn_append(_db, **kwargs):
        turns.append(kwargs)

    with (
        patch.object(session_turn_service, "_load_active", new=AsyncMock(return_value=session)),
        patch.object(session_turn_service, "_generate_next_proposal", new=AsyncMock(return_value=session)),
        patch.object(session_turn_service, "_with_turns", new=AsyncMock(return_value=session)),
        patch.object(session_service.session_repo, "add_confirmed_facts", new=fake_add_confirmed_facts),
        patch.object(session_service.session_repo, "apply_user_resolution", new=fake_apply_user_resolution),
        patch.object(session_service.turn_repo, "append", new=fake_turn_append),
    ):
        await session_turn_service.accept_flagged(
            db=db,
            user_id=session.user_id,
            session_id=session.id,
        )

    # Flagged phrases became confirmed facts.
    assert confirmed == [["40%"]]
    # The held proposal replaced the target text in the draft.
    assert applied["new_draft"] == "## Resume\n- new text with 40% improvement"
    assert applied["advance_target"] is True
    # The turn is recorded with its own role so history shows the
    # explicit confirmation.
    assert turns and turns[0]["role"] == "user_accept_flagged"
    assert turns[0]["proposed_text"] == "new text with 40% improvement"


@pytest.mark.asyncio
async def test_accept_flagged_without_held_proposal_raises() -> None:
    session = _fake_session(targets=[_target()], pending_flagged_proposal=None)
    db = _mock_db()

    with (
        patch.object(session_turn_service, "_load_active", new=AsyncMock(return_value=session)),
    ):
        with pytest.raises(NoPendingProposal):
            await session_turn_service.accept_flagged(
                db=db,
                user_id=session.user_id,
                session_id=session.id,
            )


# ---------------------------------------------------------------------------
# _generate_next_proposal — guard state persistence + loop breaker count
# ---------------------------------------------------------------------------


def _flagged_rewrite() -> dict:
    return {
        "kind": "clarify",
        "rewritten_text": "text with invented 40%",
        "rationale": "why",
        "question": "I almost added some details that aren't in your resume (40%)…",
        "hallucination_flagged": ["40%"],
        "input_tokens": 100,
        "output_tokens": 50,
        "cost_usd": Decimal("0.001"),
    }


@pytest.mark.asyncio
async def test_generation_persists_guard_state_and_increments_count() -> None:
    session = _fake_session(targets=[_target()], guard_flag_counts={"0": 1})
    db = _mock_db()
    pending_updates: list[dict] = []
    increments: list[int] = []
    rewrite_kwargs: list[dict] = []

    async def fake_run_rewrite(**kwargs):
        rewrite_kwargs.append(kwargs)
        return _flagged_rewrite()

    async def fake_update_pending(_db, sess, **kwargs):
        pending_updates.append(kwargs)
        sess.pending_guard_flagged = kwargs.get("guard_flagged")
        sess.pending_flagged_proposal = kwargs.get("flagged_proposal")
        sess.pending_clarifying_question = kwargs.get("clarifying_question")
        return sess

    async def fake_increment(_db, sess, *, target_index):
        increments.append(target_index)
        counts = dict(sess.guard_flag_counts)
        counts[str(target_index)] = counts.get(str(target_index), 0) + 1
        sess.guard_flag_counts = counts
        return sess

    async def fake_cache(_db, sess, **_):
        return sess

    with (
        patch.object(session_service.rewrite_service, "run_rewrite", new=fake_run_rewrite),
        patch.object(session_service.session_repo, "update_pending_proposal", new=fake_update_pending),
        patch.object(session_service.session_repo, "increment_guard_flag_count", new=fake_increment),
        patch.object(session_service.session_repo, "cache_proposal", new=fake_cache),
        patch.object(session_service.turn_repo, "list_for_session", new=AsyncMock(return_value=[])),
        patch.object(session_service.turn_repo, "append", new=AsyncMock()),
    ):
        await session_helpers._generate_next_proposal(
            db, session, user_id=session.user_id, hint=None,
        )

    # The rewrite saw the allowlist and the pre-existing flag count.
    assert rewrite_kwargs[0]["confirmed_facts"] == []
    assert rewrite_kwargs[0]["prior_flag_count"] == 1
    # Guard state landed on the pending fields.
    assert pending_updates[0]["guard_flagged"] == ["40%"]
    assert pending_updates[0]["flagged_proposal"] == "text with invented 40%"
    # And the per-target counter was bumped (1 → 2 ⇒ loop breaker arms).
    assert increments == [0]
