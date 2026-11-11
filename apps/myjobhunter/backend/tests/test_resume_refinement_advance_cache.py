"""Advancing to (or navigating to) a target must reuse its cached proposal
only while that proposal is still valid.

Session start prefetches a proposal per target into ``proposal_cache``.
The advance routes (accept / accept-flagged / custom / skip) used to call
Claude again for the next target, discarding the prefetch and doubling
refinement spend. These tests run the real service + repositories against
the test database and mock only the Claude-coupled ``run_rewrite``.

Entries are written through the real ``cache_proposal`` so they carry the
same validity fields production entries do.
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.resume_refinement.session import ResumeRefinementSession
from app.repositories.resume_refinement import (
    session_repo,
    session_target_repo,
    turn_repo,
)
from app.services.resume_refinement import session_helpers, session_service

_FIRST = "Led a team. Built the billing API."
_NESTED = "Built the billing API."  # a substring of _FIRST
_SECOND = "Wrote docs."
_THIRD = "Ran on-call."
_DRAFT = f"## Experience\n- {_FIRST}\n- {_SECOND}\n- {_THIRD}"


def _target(section: str, current_text: str) -> dict[str, Any]:
    return {
        "section": section,
        "current_text": current_text,
        "improvement_type": "tighten_phrasing",
        "severity": "medium",
        "notes": None,
    }


def _fresh_rewrite(**overrides: Any) -> dict[str, Any]:
    """Same keys as the real ``rewrite_service.run_rewrite`` return."""
    return {
        "kind": "proposal",
        "rewritten_text": "freshly generated",
        "rationale": "fresh rationale",
        "question": None,
        "hallucination_flagged": [],
        "input_tokens": 100,
        "output_tokens": 50,
        "cost_usd": Decimal("0.001"),
        **overrides,
    }


def _flagged_rewrite() -> dict[str, Any]:
    return _fresh_rewrite(
        kind="clarify",
        rewritten_text="text with invented 40%",
        rationale="why",
        question="Is 40% accurate?",
        hallucination_flagged=["40%"],
    )


async def _make_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    targets: list[dict[str, Any]],
    *,
    draft: str = _DRAFT,
    pending: str = "pending for first target",
) -> ResumeRefinementSession:
    session = await session_repo.create(
        db, user_id=user_id, source_resume_job_id=None, initial_draft=draft,
    )
    session.improvement_targets = targets
    session.pending_target_section = targets[0]["section"]
    session.pending_proposal = pending
    await db.commit()
    await db.refresh(session)
    return session


async def _cache(
    db: AsyncSession,
    session: ResumeRefinementSession,
    index: int,
    *,
    proposal: str | None = "cached proposal",
    clarifying_question: str | None = None,
    guard_flagged: list[str] | None = None,
    section: str | None = None,
    context_marker: int = -1,
) -> ResumeRefinementSession:
    target = session.improvement_targets[index]
    return await session_repo.cache_proposal(
        db,
        session,
        target_index=index,
        target_section=section or target["section"],
        target_text=target["current_text"],
        context_marker=context_marker,
        proposal=proposal,
        rationale="cached rationale" if proposal else None,
        clarifying_question=clarifying_question,
        guard_flagged=guard_flagged,
        flagged_proposal="held proposal" if guard_flagged else None,
    )


async def _setup(
    db: AsyncSession,
    user_factory: Any,
    targets: list[dict[str, Any]],
    **cached: Any,
) -> tuple[uuid.UUID, ResumeRefinementSession]:
    """Session with ``targets``; every index in 1.. gets a cache entry
    (``cached`` overrides apply to all of them)."""
    user_id = uuid.UUID((await user_factory())["id"])
    session = await _make_session(db, user_id, targets)
    for index in range(1, len(targets)):
        session = await _cache(db, session, index, **cached)
    return user_id, session


def _two_targets() -> list[dict[str, Any]]:
    return [_target("exp", _FIRST), _target("docs", _SECOND)]


def _three_targets() -> list[dict[str, Any]]:
    return [*_two_targets(), _target("oncall", _THIRD)]


def _patch_rewrite(mock: AsyncMock) -> Any:
    return patch(
        "app.services.resume_refinement.session_helpers.rewrite_service.run_rewrite",
        new=mock,
    )


async def _skip(db: AsyncSession, user_id: uuid.UUID, session: ResumeRefinementSession):
    return await session_service.skip_target(
        db=db, user_id=user_id, session_id=session.id,
    )


class TestAdvanceUsesCachedProposal:
    @pytest.mark.asyncio
    async def test_skip_with_cached_next_makes_no_claude_call(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id, session = await _setup(db, user_factory, _two_targets())
        rewrite = AsyncMock()

        with _patch_rewrite(rewrite):
            result = await _skip(db, user_id, session)

        rewrite.assert_not_awaited()
        assert result.target_index == 1
        assert result.pending_proposal == "cached proposal"
        assert result.pending_rationale == "cached rationale"
        assert result.total_cost_usd == Decimal("0")
        turns = await turn_repo.list_for_session(db, session.id)
        proposal_turns = [t for t in turns if t.role == "ai_proposal"]
        assert [t.proposed_text for t in proposal_turns] == ["cached proposal"]
        assert proposal_turns[0].tokens_in == 0
        indexes = [t.turn_index for t in turns]
        assert indexes == sorted(set(indexes))
        assert result.turn_count == max(indexes)

    @pytest.mark.asyncio
    async def test_accept_pending_with_cached_next_makes_no_claude_call(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id, session = await _setup(db, user_factory, _two_targets())
        rewrite = AsyncMock()

        with _patch_rewrite(rewrite):
            result = await session_service.accept_pending(
                db=db, user_id=user_id, session_id=session.id,
            )

        rewrite.assert_not_awaited()
        assert result.pending_proposal == "cached proposal"
        assert "pending for first target" in result.current_draft

    @pytest.mark.asyncio
    async def test_accept_flagged_with_cached_next_makes_no_claude_call(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id, session = await _setup(db, user_factory, _two_targets())
        session.pending_flagged_proposal = "Led a team of 40%."
        session.pending_guard_flagged = ["40%"]
        await db.commit()
        rewrite = AsyncMock()

        with _patch_rewrite(rewrite):
            result = await session_service.accept_flagged(
                db=db, user_id=user_id, session_id=session.id,
            )

        rewrite.assert_not_awaited()
        assert result.confirmed_facts == ["40%"]
        assert "Led a team of 40%." in result.current_draft
        assert result.pending_proposal == "cached proposal"

    @pytest.mark.asyncio
    async def test_cached_clarify_is_served_without_claude_call(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id, session = await _setup(
            db, user_factory, _two_targets(),
            proposal=None, clarifying_question="Which docs?",
        )
        rewrite = AsyncMock()

        with _patch_rewrite(rewrite):
            result = await _skip(db, user_id, session)

        rewrite.assert_not_awaited()
        assert result.pending_clarifying_question == "Which docs?"
        assert result.pending_proposal is None

    @pytest.mark.asyncio
    async def test_cache_miss_makes_exactly_one_claude_call(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id = uuid.UUID((await user_factory())["id"])
        session = await _make_session(db, user_id, _two_targets())
        rewrite = AsyncMock(return_value=_fresh_rewrite())

        with _patch_rewrite(rewrite):
            result = await _skip(db, user_id, session)

        rewrite.assert_awaited_once()
        assert result.pending_proposal == "freshly generated"
        assert result.proposal_cache["1"]["target_text"] == _SECOND

    @pytest.mark.asyncio
    async def test_clarify_served_on_advance_stays_valid_on_navigate_back(
        self, db: AsyncSession, user_factory,
    ) -> None:
        """Serving a clarify appends a turn carrying its own question; the
        entry must not read as stale when the user returns to it."""
        user_id, session = await _setup(db, user_factory, _three_targets())
        session = await _cache(
            db, session, 1, proposal=None, clarifying_question="Which docs?",
        )
        rewrite = AsyncMock(return_value=_fresh_rewrite())

        with _patch_rewrite(rewrite):
            await _skip(db, user_id, session)  # serves the clarify for target 1
            await session_service.navigate(
                db=db, user_id=user_id, session_id=session.id, direction="next",
            )  # target 2's entry predates the clarify turn: regenerated once
            back = await session_service.navigate(
                db=db, user_id=user_id, session_id=session.id, direction="prev",
            )

        rewrite.assert_awaited_once()
        assert back.pending_clarifying_question == "Which docs?"


class TestStaleCacheEntryIsNotUsed:
    @pytest.mark.asyncio
    async def test_custom_edit_removing_next_target_text_regenerates(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id = uuid.UUID((await user_factory())["id"])
        session = await _make_session(
            db, user_id, [_target("exp", _FIRST), _target("nested", _NESTED)],
        )
        await _cache(db, session, 1)
        rewrite = AsyncMock(return_value=_fresh_rewrite())

        with _patch_rewrite(rewrite):
            result = await session_service.accept_custom(
                db=db, user_id=user_id, session_id=session.id,
                user_text="Shipped billing.",
            )

        rewrite.assert_awaited_once()
        assert result.pending_proposal == "freshly generated"

    @pytest.mark.asyncio
    async def test_ai_rewrite_overlapping_next_target_regenerates(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id = uuid.UUID((await user_factory())["id"])
        session = await _make_session(
            db, user_id, [_target("exp", _FIRST), _target("nested", _NESTED)],
            pending="Shipped billing.",
        )
        await _cache(db, session, 1)
        rewrite = AsyncMock(return_value=_fresh_rewrite())

        with _patch_rewrite(rewrite):
            result = await session_service.accept_pending(
                db=db, user_id=user_id, session_id=session.id,
            )

        rewrite.assert_awaited_once()
        assert result.pending_proposal == "freshly generated"

    @pytest.mark.asyncio
    async def test_ai_rewrite_duplicating_next_target_text_regenerates(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id = uuid.UUID((await user_factory())["id"])
        session = await _make_session(
            db, user_id, [_target("exp", _FIRST), _target("nested", _NESTED)],
            pending=f"{_NESTED} {_NESTED}",
        )
        await _cache(db, session, 1)
        rewrite = AsyncMock(return_value=_fresh_rewrite())

        with _patch_rewrite(rewrite):
            await session_service.accept_pending(
                db=db, user_id=user_id, session_id=session.id,
            )

        rewrite.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_custom_rewrite_after_prefetch_reaches_prior_context(
        self, db: AsyncSession, user_factory,
    ) -> None:
        """The prefetched proposal never saw the user's custom wording; the
        regenerated one must be built with it in ``prior_context``."""
        user_id, session = await _setup(db, user_factory, _two_targets())
        rewrite = AsyncMock(return_value=_fresh_rewrite())

        with _patch_rewrite(rewrite):
            result = await session_service.accept_custom(
                db=db, user_id=user_id, session_id=session.id,
                user_text="Shipped billing.",
            )

        rewrite.assert_awaited_once()
        prior_context = rewrite.await_args.kwargs["prior_context"]
        assert {"kind": "user_custom_rewrite", "section": "exp", "text": "Shipped billing."} in prior_context
        assert result.pending_proposal == "freshly generated"

    @pytest.mark.asyncio
    async def test_hint_after_prefetch_makes_later_entries_stale(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id, session = await _setup(db, user_factory, _three_targets())
        rewrite = AsyncMock(return_value=_fresh_rewrite())

        with _patch_rewrite(rewrite):
            await session_service.request_alternative(
                db=db, user_id=user_id, session_id=session.id, hint="more concise",
            )
            assert rewrite.await_count == 1
            await _skip(db, user_id, session)

        assert rewrite.await_count == 2

    @pytest.mark.asyncio
    async def test_entry_for_a_different_target_regenerates(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id, session = await _setup(
            db, user_factory, _two_targets(), section="some-other-section",
        )
        rewrite = AsyncMock(return_value=_fresh_rewrite())

        with _patch_rewrite(rewrite):
            result = await _skip(db, user_id, session)

        rewrite.assert_awaited_once()
        assert result.pending_proposal == "freshly generated"

    @pytest.mark.asyncio
    async def test_flagged_entry_stale_after_facts_confirmed_regenerates(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id, session = await _setup(
            db, user_factory, _two_targets(),
            proposal=None, clarifying_question="Is 40% accurate?", guard_flagged=["40%"],
        )
        session.pending_flagged_proposal = "Led a team of 40%."
        session.pending_guard_flagged = ["40%"]
        await db.commit()
        rewrite = AsyncMock(return_value=_fresh_rewrite())

        with _patch_rewrite(rewrite):
            await session_service.accept_flagged(
                db=db, user_id=user_id, session_id=session.id,
            )

        rewrite.assert_awaited_once()
        # The prefetched flag was never shown, so it is not a repeat.
        assert rewrite.await_args.kwargs["prior_flag_count"] == 0


class TestAnotherOptionNeverUsesCache:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("hint", [None, "more concise"])
    async def test_request_alternative_always_calls_claude(
        self, db: AsyncSession, user_factory, hint: str | None,
    ) -> None:
        user_id = uuid.UUID((await user_factory())["id"])
        session = await _make_session(db, user_id, _two_targets())
        session = await _cache(db, session, 0)
        rewrite = AsyncMock(return_value=_fresh_rewrite())

        with _patch_rewrite(rewrite):
            result = await session_service.request_alternative(
                db=db, user_id=user_id, session_id=session.id, hint=hint,
            )

        rewrite.assert_awaited_once()
        assert result.pending_proposal == "freshly generated"

    @pytest.mark.asyncio
    async def test_use_cache_false_skips_a_valid_entry(
        self, db: AsyncSession, user_factory,
    ) -> None:
        """The cache bypass is the parameter, not the invalidation that
        ``request_alternative`` happens to do first."""
        user_id = uuid.UUID((await user_factory())["id"])
        session = await _make_session(db, user_id, _two_targets())
        session = await _cache(db, session, 0)
        rewrite = AsyncMock(return_value=_fresh_rewrite())

        with _patch_rewrite(rewrite):
            await session_helpers._generate_next_proposal(
                db, session, user_id=user_id, hint=None, use_cache=False,
            )

        rewrite.assert_awaited_once()


class TestShiftedCacheKeys:
    @pytest.mark.asyncio
    async def test_advance_after_create_target_from_line_uses_shifted_entry(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id, session = await _setup(db, user_factory, _three_targets())
        rewrite = AsyncMock(return_value=_fresh_rewrite())

        with _patch_rewrite(rewrite):
            await session_service.create_target_from_line(
                db=db, user_id=user_id, session_id=session.id,
                current_text=_THIRD.replace("Ran", "Ran the"), section="oncall-new",
            )
            assert rewrite.await_count == 1  # the new target is generated on demand
            result = await _skip(db, user_id, session)

        assert rewrite.await_count == 1  # old target 1 now at index 2: cache hit
        assert result.target_index == 2
        assert result.pending_proposal == "cached proposal"

    @pytest.mark.asyncio
    async def test_advance_after_insert_target_at_uses_shifted_entry(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id, session = await _setup(db, user_factory, _three_targets())
        session = await session_target_repo.insert_target_at(
            db, session, target=_target("inserted", "Inserted line."), insert_at=1,
        )
        rewrite = AsyncMock()

        with _patch_rewrite(rewrite):
            result = await _skip(db, user_id, session)

        rewrite.assert_not_awaited()
        assert result.target_index == 2
        assert result.improvement_targets[2]["section"] == "docs"
        assert result.pending_proposal == "cached proposal"


class TestNavigateAndJumpHonourValidity:
    @pytest.mark.asyncio
    async def test_navigate_serves_valid_entry(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id, session = await _setup(db, user_factory, _two_targets())
        rewrite = AsyncMock()

        with _patch_rewrite(rewrite):
            result = await session_service.navigate(
                db=db, user_id=user_id, session_id=session.id, direction="next",
            )

        rewrite.assert_not_awaited()
        assert result.pending_proposal == "cached proposal"

    @pytest.mark.asyncio
    async def test_navigate_regenerates_stale_entry(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id = uuid.UUID((await user_factory())["id"])
        session = await _make_session(
            db, user_id, [_target("exp", _FIRST), _target("nested", _NESTED)],
        )
        await _cache(db, session, 1)
        # A custom edit elsewhere removes the text the entry was written for.
        session.current_draft = "## Experience\n- Shipped billing."
        await db.commit()
        rewrite = AsyncMock(return_value=_fresh_rewrite())

        with _patch_rewrite(rewrite):
            result = await session_service.navigate(
                db=db, user_id=user_id, session_id=session.id, direction="next",
            )

        rewrite.assert_awaited_once()
        assert result.pending_proposal == "freshly generated"

    @pytest.mark.asyncio
    async def test_jump_to_existing_target_serves_valid_entry(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id, session = await _setup(db, user_factory, _two_targets())
        rewrite = AsyncMock()

        with _patch_rewrite(rewrite):
            result = await session_service.create_target_from_line(
                db=db, user_id=user_id, session_id=session.id,
                current_text=_SECOND, section="docs",
            )

        rewrite.assert_not_awaited()
        assert result.pending_proposal == "cached proposal"

    @pytest.mark.asyncio
    async def test_jump_to_existing_target_regenerates_stale_entry(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id, session = await _setup(
            db, user_factory, _two_targets(), section="some-other-section",
        )
        rewrite = AsyncMock(return_value=_fresh_rewrite())

        with _patch_rewrite(rewrite):
            result = await session_service.create_target_from_line(
                db=db, user_id=user_id, session_id=session.id,
                current_text=_SECOND, section="docs",
            )

        rewrite.assert_awaited_once()
        assert result.pending_proposal == "freshly generated"


class TestGuardFlagCountOnlyCountsShownFlags:
    @pytest.mark.asyncio
    async def test_prefetch_does_not_count_flags_the_user_has_not_seen(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id = uuid.UUID((await user_factory())["id"])
        session = await _make_session(db, user_id, _two_targets())
        rewrite = AsyncMock(return_value=_flagged_rewrite())

        with _patch_rewrite(rewrite):
            session = await session_helpers._prefetch_all_proposals(
                db, session, user_id=user_id,
            )

        assert rewrite.await_count == 2
        assert session.guard_flag_counts == {}
        assert session.proposal_cache["1"]["guard_flagged"] == ["40%"]

    @pytest.mark.asyncio
    async def test_showing_a_prefetched_flag_counts_once(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id = uuid.UUID((await user_factory())["id"])
        session = await _make_session(db, user_id, _three_targets())
        rewrite = AsyncMock(return_value=_flagged_rewrite())

        with _patch_rewrite(rewrite):
            session = await session_helpers._prefetch_all_proposals(
                db, session, user_id=user_id,
            )
            rewrite.reset_mock()
            first = await session_service.navigate(
                db=db, user_id=user_id, session_id=session.id, direction="next",
            )
            assert first.guard_flag_counts == {"1": 1}
            await session_service.navigate(
                db=db, user_id=user_id, session_id=session.id, direction="next",
            )
            again = await session_service.navigate(
                db=db, user_id=user_id, session_id=session.id, direction="prev",
            )

        rewrite.assert_not_awaited()
        assert again.guard_flag_counts == {"1": 1, "2": 1}  # revisits never add

    @pytest.mark.asyncio
    async def test_regenerating_a_shown_flag_reads_it_as_a_repeat(
        self, db: AsyncSession, user_factory,
    ) -> None:
        user_id = uuid.UUID((await user_factory())["id"])
        session = await _make_session(db, user_id, _two_targets())
        rewrite = AsyncMock(return_value=_flagged_rewrite())

        with _patch_rewrite(rewrite):
            session = await session_helpers._prefetch_all_proposals(
                db, session, user_id=user_id,
            )
            await _skip(db, user_id, session)  # shows the flag: count 1
            rewrite.reset_mock()
            result = await session_service.request_alternative(
                db=db, user_id=user_id, session_id=session.id, hint="it is accurate",
            )

        assert rewrite.await_args.kwargs["prior_flag_count"] == 1
        assert result.guard_flag_counts == {"1": 2}
