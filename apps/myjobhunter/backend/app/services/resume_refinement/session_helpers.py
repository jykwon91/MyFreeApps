"""Private helpers shared by the session lifecycle and turn modules.

Nothing in this module is part of the public API — callers outside the
``resume_refinement`` service package should never import from here directly.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.resume_refinement.session import ResumeRefinementSession
from app.repositories.resume_refinement import session_repo, turn_repo
from app.services.resume_refinement import rewrite_service
from app.services.resume_refinement.cached_proposal import is_cached_proposal_usable
from app.services.resume_refinement.errors import (
    SessionNotActive,
    SessionNotFound,
)

logger = logging.getLogger(__name__)

# Cap on parallel Claude calls during session-start prefetch. Anthropic
# allows higher concurrency, but throttling protects against rate-limit
# spikes when a session has many improvement targets and ensures a
# clean failure mode if Claude has an outage (5 in-flight requests
# fail-fast vs. 13).
_PREFETCH_CONCURRENCY = 5


async def _with_turns(
    db: AsyncSession, session: ResumeRefinementSession,
) -> ResumeRefinementSession:
    """Reload ``session`` with the ``turns`` relationship eager-loaded.

    Mutation entry points return the in-memory session object whose
    ``turns`` collection isn't loaded — touching ``session.turns`` from
    the response shaper would raise ``MissingGreenlet`` under async
    SQLAlchemy. Calling this once before returning to the API layer
    guarantees the response includes the chat history without forcing
    every upstream caller to re-fetch.
    """
    reloaded = await session_repo.get_with_turns_for_user(
        db, session.id, session.user_id,
    )
    return reloaded if reloaded is not None else session


async def _load_active(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ResumeRefinementSession:
    session = await session_repo.get_by_id_for_user(db, session_id, user_id)
    if session is None:
        raise SessionNotFound()
    if session.status != "active":
        raise SessionNotActive(
            f"Session is in status={session.status!r}; cannot modify."
        )
    return session


def _context_entry(turn: Any) -> dict[str, Any] | None:
    """The ``prior_context`` item a turn contributes, or None if it carries
    no signal. The single inclusion rule behind both ``_build_prior_context``
    and ``_prior_context_marker`` — keep them in lockstep by editing only here.
    """
    role = turn.role
    section = turn.target_section
    if role == "ai_critique":
        text = (turn.rationale or "").strip()
        if text:
            return {"kind": "ai_critique", "section": None, "text": text}
    elif role == "ai_proposal":
        text = (turn.clarifying_question or "").strip()
        if text:
            return {
                "kind": "ai_clarification_question",
                "section": section,
                "text": text,
            }
    elif role == "user_custom":
        text = (turn.user_text or "").strip()
        if text:
            return {"kind": "user_custom_rewrite", "section": section, "text": text}
    elif role == "user_request_alternative":
        text = (turn.user_text or "").strip()
        if text:
            return {"kind": "user_hint", "section": section, "text": text}
    return None


def _build_prior_context(turns: list[Any]) -> list[dict[str, Any]]:
    """Distill turn rows into the lightweight ``prior_context`` shape the
    rewrite service feeds into Claude's user content.

    Filters to the entries that carry signal Claude needs across targets:

    - ``ai_critique`` rationale — the framing of the whole session
    - ``ai_proposal`` clarifying questions — what was already asked
    - ``user_custom`` text — the user's voice / preferred phrasing
    - ``user_request_alternative`` hint — the user's stated nudges

    Skips ``ai_proposal`` proposed_text (already reflected in
    current_draft if accepted), ``user_accept`` (same), ``user_skip``
    (no info), and ``session_complete`` (terminal). Keeping the list
    narrow controls token cost — full transcripts grow linearly with
    target count and would cost ~2x by the end of a 14-target session.

    The same inclusion rule drives ``_prior_context_marker``: a cached
    proposal is only reusable while no new turn has joined this list, so
    changing what is included here changes when the cache is invalidated.
    """
    entries = (_context_entry(turn) for turn in turns)
    return [entry for entry in entries if entry is not None]


def _prior_context_marker(turns: list[Any]) -> int:
    """Index of the newest turn that ``_build_prior_context`` includes
    (-1 when none). Stored on each cache entry; an entry generated under
    an older marker saw less context than a fresh Claude call would.
    """
    return max(
        (turn.turn_index for turn in turns if _context_entry(turn) is not None),
        default=-1,
    )


def _current_target(session: ResumeRefinementSession) -> dict | None:
    targets = session.improvement_targets or []
    if session.target_index >= len(targets):
        return None
    return targets[session.target_index]


def _usable_cached_entry(
    session: ResumeRefinementSession, turns: list[Any],
) -> dict[str, Any] | None:
    """The cached entry for the session's current target, if still valid."""
    target = _current_target(session)
    entry = (session.proposal_cache or {}).get(str(session.target_index))
    if target is None or not is_cached_proposal_usable(
        entry,
        target=target,
        current_draft=session.current_draft,
        context_marker=_prior_context_marker(turns),
        confirmed_facts_count=len(session.confirmed_facts or []),
    ):
        return None
    return entry


async def _load_usable_cached_entry(
    db: AsyncSession, session: ResumeRefinementSession,
) -> dict[str, Any] | None:
    """``_usable_cached_entry`` for callers that haven't loaded the turns
    (navigate, jump-to-target) — they hydrate from the cache themselves."""
    turns = await turn_repo.list_for_session(db, session.id)
    return _usable_cached_entry(session, turns)


async def _generate_next_proposal(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    user_id: uuid.UUID,
    hint: str | None,
    use_cache: bool,
) -> ResumeRefinementSession:
    """If a target remains, produce a proposal. Otherwise mark complete-ready.

    "Complete-ready" means the session has consumed all critique
    targets but the user hasn't explicitly clicked Done. We don't
    auto-complete — the user always presses the button. We just clear
    pending state.

    With ``use_cache=True`` a still-valid ``proposal_cache`` entry for the
    target (prefetched at session start) is served with no Claude call;
    a miss or stale entry generates as usual. Pass ``use_cache=False``
    when the caller wants a fresh generation regardless
    (``request_alternative``) or has already ruled the cache out.
    """
    target = _current_target(session)
    if target is None:
        # No more targets — clear pending state. The user clicks Complete to lock.
        return await session_repo.clear_pending_state(db, session)

    prior_turns = await turn_repo.list_for_session(db, session.id)

    if use_cache:
        entry = _usable_cached_entry(session, prior_turns)
        if entry is not None:
            return await _serve_cached_proposal(
                db, session, target, entry, prior_turns,
            )

    prior_context = _build_prior_context(prior_turns)

    try:
        rewrite = await rewrite_service.run_rewrite(
            resume_markdown=session.current_draft,
            target=target,
            hint=hint,
            user_id=user_id,
            session_id=session.id,
            prior_context=prior_context,
            confirmed_facts=list(session.confirmed_facts or []),
            prior_flag_count=int(
                (session.guard_flag_counts or {}).get(str(session.target_index), 0)
            ),
        )
    except Exception as exc:  # noqa: BLE001 — graceful-degrade for the iteration loop
        # Don't fail the user's action if Claude is flaky. Leave pending
        # state cleared; the frontend can show a retry affordance and
        # the user can request_alternative or skip to nudge generation.
        logger.error(
            "Rewrite generation failed for session %s target_index=%d: %s",
            session.id,
            session.target_index,
            exc,
        )
        return session

    flagged = list(rewrite.get("hallucination_flagged") or [])
    session = await session_repo.update_pending_proposal(
        db,
        session,
        target_section=target.get("section"),
        proposal=rewrite["rewritten_text"] if rewrite["kind"] == "proposal" else None,
        rationale=rewrite["rationale"] if rewrite["kind"] == "proposal" else None,
        clarifying_question=rewrite["question"] if rewrite["kind"] == "clarify" else None,
        tokens_in=rewrite["input_tokens"],
        tokens_out=rewrite["output_tokens"],
        cost_usd=rewrite["cost_usd"],
        guard_flagged=flagged or None,
        flagged_proposal=rewrite["rewritten_text"] if flagged else None,
    )
    if flagged:
        # Loop breaker bookkeeping: from the second flag on the same
        # target, the clarify copy + frontend offer "Use it anyway".
        session = await session_repo.increment_guard_flag_count(
            db, session, target_index=session.target_index,
        )

    ai_turn = await turn_repo.append(
        db,
        session_id=session.id,
        turn_index=session.turn_count,
        role="ai_proposal",
        target_section=target.get("section"),
        proposed_text=session.pending_proposal,
        rationale=session.pending_rationale,
        clarifying_question=session.pending_clarifying_question,
        tokens_in=rewrite["input_tokens"],
        tokens_out=rewrite["output_tokens"],
    )

    # Cache the proposal so navigating back to this target_index later
    # is instant. ``request_alternative`` invalidates this entry before
    # asking us to regenerate. Written after the turn so the marker
    # already counts this proposal's own clarify question — otherwise the
    # entry would look stale the moment the user navigated back to it.
    return await session_repo.cache_proposal(
        db,
        session,
        target_index=session.target_index,
        target_section=session.pending_target_section,
        target_text=target.get("current_text"),
        context_marker=_prior_context_marker([*prior_turns, ai_turn]),
        proposal=session.pending_proposal,
        rationale=session.pending_rationale,
        clarifying_question=session.pending_clarifying_question,
        guard_flagged=session.pending_guard_flagged,
        flagged_proposal=session.pending_flagged_proposal,
    )


async def _serve_cached_proposal(
    db: AsyncSession,
    session: ResumeRefinementSession,
    target: dict[str, Any],
    entry: dict[str, Any],
    prior_turns: list[Any],
) -> ResumeRefinementSession:
    """Serve a valid cache ``entry`` as the next proposal, recording the
    same ``ai_proposal`` turn a generation would — with zero tokens, since
    the spend was recorded when the entry was made.
    """
    session = await session_repo.apply_cached_proposal(
        db, session, target_index=session.target_index, entry=entry,
    )
    ai_turn = await turn_repo.append(
        db,
        session_id=session.id,
        turn_index=session.turn_count,
        role="ai_proposal",
        target_section=target.get("section"),
        proposed_text=session.pending_proposal,
        rationale=session.pending_rationale,
        clarifying_question=session.pending_clarifying_question,
    )
    marker = _prior_context_marker([*prior_turns, ai_turn])
    if marker != entry["context_marker"]:
        # The turn just appended carries this entry's own clarify question.
        session = await session_repo.update_cached_context_marker(
            db, session, target_index=session.target_index, context_marker=marker,
        )
    return session


async def _prefetch_all_proposals(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    user_id: uuid.UUID,
) -> ResumeRefinementSession:
    """Generate proposals for every critique target in parallel and
    populate ``proposal_cache``.

    Called once at session start so the operator's first navigation
    forward — and every navigation after — is a cache hit. Per-target
    Claude failures degrade gracefully: those targets are simply left
    out of the cache and will generate on first visit.

    Concurrency is capped at ``_PREFETCH_CONCURRENCY`` to avoid
    triggering Anthropic rate limits when a session has many targets.
    Total wall-clock latency is approximately
    ``ceil(N / _PREFETCH_CONCURRENCY) * one_round_trip``.

    Token / cost counters on the session are updated by the per-target
    helper, so the operator's totals reflect the true spend.
    """
    targets = session.improvement_targets or []
    if not targets:
        return session

    semaphore = asyncio.Semaphore(_PREFETCH_CONCURRENCY)
    current_draft = session.current_draft
    confirmed_facts = list(session.confirmed_facts or [])

    # Prefetch fires right after the critique pass appends the
    # ai_critique turn, so prior_context here will contain at most the
    # critique rationale. Computing it once lets all parallel rewrites
    # share the same session framing.
    prior_turns = await turn_repo.list_for_session(db, session.id)
    prior_context = _build_prior_context(prior_turns)

    async def _one(target_index: int, target: dict[str, Any]) -> dict[str, Any] | None:
        async with semaphore:
            try:
                rewrite = await rewrite_service.run_rewrite(
                    resume_markdown=current_draft,
                    target=target,
                    hint=None,
                    user_id=user_id,
                    session_id=session.id,
                    prior_context=prior_context,
                    confirmed_facts=confirmed_facts,
                )
            except Exception as exc:  # noqa: BLE001 — graceful per-target degrade
                logger.warning(
                    "Prefetch rewrite failed session=%s target_index=%d: %s",
                    session.id, target_index, exc,
                )
                return None
            return {
                "target_index": target_index,
                "target": target,
                "rewrite": rewrite,
            }

    results = await asyncio.gather(
        *[_one(i, t) for i, t in enumerate(targets)],
    )

    # Sequential DB writes after parallel Claude calls — JSONB column
    # mutation is not safe across concurrent transactions on the same
    # row. Each write is fast (single round-trip) so the sequential
    # cost is negligible.
    context_marker = _prior_context_marker(prior_turns)
    for entry in results:
        if entry is None:
            continue
        target = entry["target"]
        rewrite = entry["rewrite"]
        is_proposal = rewrite.get("kind") == "proposal"
        is_clarify = rewrite.get("kind") == "clarify"
        flagged = list(rewrite.get("hallucination_flagged") or [])

        # Bump session counters via update_pending_proposal — but for
        # prefetch we don't actually want the pending_* fields stamped
        # (they belong to the CURRENT target only). Use a token-only
        # accumulator instead.
        session.total_tokens_in += rewrite["input_tokens"]
        session.total_tokens_out += rewrite["output_tokens"]
        session.total_cost_usd = (
            session.total_cost_usd or Decimal("0")
        ) + rewrite["cost_usd"]

        # Flags are deliberately NOT counted here: the user hasn't seen
        # this proposal yet. The counter moves when a flagged entry is
        # first shown (cache hydration) or when a flagged proposal is
        # generated on demand.
        session = await session_repo.cache_proposal(
            db,
            session,
            target_index=entry["target_index"],
            target_section=target.get("section"),
            target_text=target.get("current_text"),
            context_marker=context_marker,
            proposal=rewrite["rewritten_text"] if is_proposal else None,
            rationale=rewrite["rationale"] if is_proposal else None,
            clarifying_question=rewrite["question"] if is_clarify else None,
            guard_flagged=flagged or None,
            flagged_proposal=rewrite["rewritten_text"] if flagged else None,
        )
    return session


def _apply_rewrite(
    current_draft: str,
    *,
    target_current_text: str,
    new_text: str,
) -> str:
    """Apply a rewrite to the draft via verbatim substring replacement.

    The critique pass returns ``current_text`` verbatim from the source
    so a plain substring replace is safe AS LONG AS the user hasn't
    edited the draft elsewhere in a way that changed the target. We
    only replace the FIRST occurrence to avoid clobbering structurally
    similar bullets.

    If the substring is not found (rare — shouldn't happen in practice
    since the critique just ran on this exact draft), we append the new
    text to the end of the draft so the user's input isn't silently
    lost. The next critique pass would identify the duplication; this
    is the safer failure mode.
    """
    if not target_current_text:
        return f"{current_draft}\n\n{new_text}".strip()

    if target_current_text in current_draft:
        return current_draft.replace(target_current_text, new_text, 1)

    logger.warning(
        "Rewrite target not found in draft — appending. (target preview: %r)",
        target_current_text[:80],
    )
    return f"{current_draft}\n\n{new_text}".strip()
