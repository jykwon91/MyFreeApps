"""One tutor turn: prepare -> stream the reply -> corrections -> settle.

No database connection is held while Claude runs. The turn is two short
transactions around the model calls (the MGA item_extractor pattern):

1. ``prepare_turn`` (one ``unit_of_work``): ownership + session checks under a
   row lock, next ``seq``, history, quota reservation, and the turn row
   inserted as ``partial``. Any rejection rolls all of it back and is raised
   BEFORE the SSE stream opens, so the route can answer 404 / 409 / 429 / 503.
2. ``stream_turn`` (async generator of SSE events): the reply stream and the
   corrections call run in PARALLEL; the translation of the finished reply
   runs after it. Then ``_settle`` (a second ``unit_of_work``) persists the
   texts + usage, marks the turn complete / partial / failed, bumps
   ``turn_count`` and settles the quota reservation.

Client disconnect cancels the generator; the ``finally`` block settles the
turn under a shielded cancel scope. Once the turn's result is worked out (its
corrections, translation and goal progress) it is settled exactly like a normal
completion, even if the client left before ``done``. Before that, a turn with no
reply token yet is ``failed`` and settled like a pre-token upstream error (only
usage known to have happened is charged, usually a full refund); once tokens
streamed the quota reservation is KEPT (they were generated but are uncounted); the status is
``complete`` once ``reply.done`` was sent -- the learner has the whole reply,
only its corrections are missing -- and ``partial`` before that.

Never log transcript text -- ids, counts and Anthropic ``error.type`` only.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from enum import Enum

import anthropic
import anyio
from pydantic import BaseModel

from platform_shared.extraction.anthropic_errors import (
    AnthropicFailure,
    AnthropicFailureKind,
)

from app.core.config import settings
from app.db.session import unit_of_work
from app.domain.session_status import SessionStatus
from app.domain.turn_status import TurnStatus
from app.models.tutor.tutor_turn import TutorTurn
from app.repositories.tutor import tutor_session_repository, tutor_turn_repository
from app.schemas.tutor.turn_schemas import (
    CorrectionsEvent,
    ReplyDeltaEvent,
    TurnDoneEvent,
    TurnErrorEvent,
    TurnStartedEvent,
    TurnUsage,
)
from app.services.tutor import quota_service, session_limits, turn_estimate
from app.services.tutor.claude_client import get_client
from app.services.tutor.corrections_mapper import (
    CorrectionsResult,
    scenario_state_for,
)
from app.services.tutor.prepared_turn import PreparedTurn
from app.services.tutor.prompt_builder import (
    build_corrections_request,
    build_reply_request,
)
from app.services.tutor.turn_calls import (
    cancel_task,
    classify_failure,
    corrections_usage_if_done,
    run_corrections,
    run_translation,
    turn_units,
)
from app.services.tutor.turn_errors import (
    SessionEndedError,
    SessionNotFoundError,
    SessionTurnLimitError,
)
from app.services.tutor.usage_units import CallUsage

logger = logging.getLogger(__name__)

# SSE event names (the frontend's parser switches on these).
EVENT_TURN_STARTED = "turn.started"
EVENT_REPLY_DELTA = "reply.delta"
EVENT_REPLY_DONE = "reply.done"
EVENT_CORRECTIONS = "corrections"
EVENT_ERROR = "error"
EVENT_DONE = "done"

_ERROR_CODES: dict[AnthropicFailureKind, tuple[str, bool]] = {
    AnthropicFailureKind.RATE_LIMITED: ("tutor_busy", True),
    AnthropicFailureKind.UPSTREAM: ("tutor_busy", True),
    AnthropicFailureKind.MISCONFIGURED: ("tutor_misconfigured", False),
    AnthropicFailureKind.INPUT_REJECTED: ("tutor_input_rejected", False),
}
_EMPTY_REPLY_CODE = "tutor_busy"


@dataclass(frozen=True)
class TurnEvent:
    """One SSE event: ``name`` -> ``event:``, ``payload`` -> ``data:`` JSON."""

    name: str
    payload: BaseModel | None = None


class _EmptyPayload(BaseModel):
    pass


class _Settlement(Enum):
    RECONCILE = "reconcile"
    """Charge what the calls actually used (release the rest)."""
    KEEP = "keep"
    """Keep the whole reservation (tokens generated but uncounted)."""


@dataclass
class _Outcome:
    status: TurnStatus
    settlement: _Settlement
    reply_text: str | None = None
    corrections: CorrectionsResult | None = None
    translation: str | None = None
    usage_units: int = 0
    usage: CallUsage = field(default_factory=CallUsage)


def _no_reply_outcome(reply_usage: CallUsage, corrections_usage: CallUsage) -> _Outcome:
    """A turn that ends without a reply (upstream error before any token, an
    empty or whitespace-only reply, or the client leaving before any token):
    charge only what we know was used -- the reply call's reported usage and the
    corrections call, if it had already finished -- and release the rest."""
    return _Outcome(
        status=TurnStatus.FAILED,
        settlement=_Settlement.RECONCILE,
        usage=reply_usage + corrections_usage,
        usage_units=turn_units(reply_usage, corrections_usage, CallUsage()),
    )


# ---------------------------------------------------------------------------
# 1. Prepare (pre-stream transaction)
# ---------------------------------------------------------------------------


async def prepare_turn(
    *, user_id: uuid.UUID, session_id: uuid.UUID, text: str,
) -> PreparedTurn:
    """Validate, reserve quota and record the turn as ``partial``.

    Raises ``TurnRejectedError`` subclasses or ``quota_service.QuotaError``
    subclasses; on any raise nothing is persisted (one transaction).
    """
    async with unit_of_work() as db:
        session = await tutor_session_repository.get_by_id_for_update(db, session_id, user_id)
        if session is None:
            raise SessionNotFoundError("session not found")
        if session.status != SessionStatus.ACTIVE.value:
            raise SessionEndedError("session has ended")
        if session_limits.turn_limit_reached(session):
            raise SessionTurnLimitError("session turn limit reached")

        prompt = await turn_estimate.next_turn_prompt(db, session, text)
        reply_request = build_reply_request(prompt)
        corrections_request = build_corrections_request(prompt)
        seq = await tutor_turn_repository.next_seq(db, session_id)
        reservation = await quota_service.reserve(
            db,
            user_id=user_id,
            units=turn_estimate.reservation_for(reply_request, corrections_request),
        )
        turn = await tutor_turn_repository.create(
            db,
            TutorTurn(
                session_id=session_id,
                user_id=user_id,
                seq=seq,
                learner_text=text,
                status=TurnStatus.PARTIAL.value,
                model=settings.ltutor_reply_model,
            ),
        )
        turn_id = turn.id
    logger.info(
        "tutor turn prepared: turn_id=%s session_id=%s seq=%d reserved_units=%d",
        turn_id, session_id, seq, reservation.units,
    )
    return PreparedTurn(
        turn_id=turn_id,
        seq=seq,
        session_id=session_id,
        user_id=user_id,
        prompt=prompt,
        reply_request=reply_request,
        corrections_request=corrections_request,
        reservation=reservation,
    )


# ---------------------------------------------------------------------------
# 2. Stream
# ---------------------------------------------------------------------------


async def stream_turn(prepared: PreparedTurn) -> AsyncIterator[TurnEvent]:
    """Yield the turn's SSE events. Always ends with ``done`` unless the
    client disconnects (then the turn is settled in ``finally``)."""
    client = get_client()
    outcome: _Outcome | None = None
    settle_attempted = False
    reply_delivered = False
    reply_parts: list[str] = []
    reply_usage = CallUsage()
    corrections_task: asyncio.Task[tuple[CorrectionsResult | None, CallUsage]] | None = None
    translation_task: asyncio.Task[tuple[str | None, CallUsage]] | None = None
    try:
        yield TurnEvent(EVENT_TURN_STARTED, TurnStartedEvent(turn_id=prepared.turn_id, seq=prepared.seq))
        corrections_task = asyncio.create_task(run_corrections(client, prepared))

        failure: AnthropicFailure | None = None
        request = prepared.reply_request
        try:
            async with client.messages.stream(
                model=settings.ltutor_reply_model,
                max_tokens=settings.ltutor_reply_max_tokens,
                system=request.system,
                messages=request.messages,
            ) as stream:
                async for text in stream.text_stream:
                    if text:
                        reply_parts.append(text)
                        yield TurnEvent(EVENT_REPLY_DELTA, ReplyDeltaEvent(text=text))
                final = await stream.get_final_message()
                reply_usage = CallUsage.from_api(getattr(final, "usage", None))
        except (anthropic.APIStatusError, anthropic.APIConnectionError) as exc:
            failure = classify_failure(exc, "tutor reply")

        reply_text = "".join(reply_parts).strip()
        if failure is not None or not reply_text:
            await cancel_task(corrections_task)
            corrections_usage = corrections_usage_if_done(corrections_task)
            if failure is None:
                logger.warning("tutor reply: empty reply turn_id=%s", prepared.turn_id)
                code, retryable = _EMPTY_REPLY_CODE, True
            else:
                code, retryable = _ERROR_CODES[failure.kind]
            if reply_text:
                # Cut off mid-stream: tokens were billed but uncounted.
                outcome = _Outcome(
                    status=TurnStatus.PARTIAL,
                    settlement=_Settlement.KEEP,
                    reply_text=reply_text,
                )
            else:
                # The tutor said nothing (no tokens, or only whitespace).
                outcome = _no_reply_outcome(reply_usage, corrections_usage)
            yield TurnEvent(EVENT_ERROR, TurnErrorEvent(code=code, retryable=retryable))
        else:
            yield TurnEvent(EVENT_REPLY_DONE, _EmptyPayload())
            # Resumed, so the client has the whole reply: a disconnect from here on
            # loses only the corrections.
            reply_delivered = True
            translation_task = asyncio.create_task(run_translation(client, prepared, reply_text))
            corrections, corrections_usage = await corrections_task
            translation, translation_usage = await translation_task
            if corrections is None:
                corrections = CorrectionsResult(
                    items=[],
                    retry_prompt=None,
                    scenario_state=scenario_state_for(
                        set(prepared.prompt.goals_met), len(prepared.prompt.session.scenario.goals),
                    ),
                )
            outcome = _Outcome(
                status=TurnStatus.COMPLETE,
                settlement=_Settlement.RECONCILE,
                reply_text=reply_text,
                corrections=corrections,
                translation=translation,
                usage=reply_usage + corrections_usage + translation_usage,
                usage_units=turn_units(reply_usage, corrections_usage, translation_usage),
            )
            yield TurnEvent(
                EVENT_CORRECTIONS,
                CorrectionsEvent(
                    items=corrections.items,
                    retry_prompt=corrections.retry_prompt,
                    scenario_state=corrections.scenario_state,
                    translation=translation,
                ),
            )

        settle_attempted = True
        # Shielded so a disconnect can't cut the settlement off halfway.
        with anyio.CancelScope(shield=True):
            remaining = await _settle(prepared, outcome)
        yield TurnEvent(
            EVENT_DONE,
            TurnDoneEvent(status=outcome.status.value, usage=TurnUsage(remaining_fraction=remaining)),
        )
    finally:
        # Shielded: on client disconnect this runs inside a cancelled anyio
        # scope, where every unshielded await would be cancelled again.
        with anyio.CancelScope(shield=True):
            await cancel_task(corrections_task)
            await cancel_task(translation_task)
            if not settle_attempted:
                # Client went away (or an unexpected error) before settlement.
                if outcome is not None:
                    # The turn's result was already worked out (and maybe sent):
                    # save and charge it exactly as the normal settlement would.
                    abandoned = outcome
                elif not reply_parts:
                    # No reply reached the learner: a failed turn, not a charge.
                    abandoned = _no_reply_outcome(
                        reply_usage, corrections_usage_if_done(corrections_task),
                    )
                else:
                    # Tokens were generated but are uncounted: KEEP the reservation.
                    reply_text = "".join(reply_parts).strip()
                    if reply_delivered:
                        status = TurnStatus.COMPLETE
                    else:
                        status = TurnStatus.PARTIAL if reply_text else TurnStatus.FAILED
                    abandoned = _Outcome(
                        status=status,
                        settlement=_Settlement.KEEP,
                        reply_text=reply_text or None,
                    )
                logger.info(
                    "tutor turn abandoned before settlement: turn_id=%s", prepared.turn_id,
                )
                await _settle(prepared, abandoned)


# ---------------------------------------------------------------------------
# 3. Settle (post-stream transaction)
# ---------------------------------------------------------------------------

async def _settle(prepared: PreparedTurn, outcome: _Outcome) -> float:
    """Persist the turn and settle its quota. Returns the user's remaining fraction."""
    async with unit_of_work() as db:
        turn = await tutor_turn_repository.get_by_id(db, prepared.turn_id, prepared.user_id)
        if turn is not None:
            turn.status = outcome.status.value
            turn.reply_text = outcome.reply_text
            if outcome.corrections is not None:
                turn.corrections_json = outcome.corrections.model_dump_json()
            turn.translation_text = outcome.translation
            turn.input_tokens = outcome.usage.input_tokens
            turn.output_tokens = outcome.usage.output_tokens
            turn.cache_read_tokens = outcome.usage.cache_read_tokens
            turn.cache_write_tokens = outcome.usage.cache_write_tokens
            turn.cost_units = (
                outcome.usage_units
                if outcome.settlement is _Settlement.RECONCILE
                else prepared.reservation.units
            )
        if outcome.status is not TurnStatus.FAILED:
            await tutor_session_repository.increment_turn_count(
                db, prepared.session_id, prepared.user_id,
            )
        if outcome.settlement is _Settlement.RECONCILE:
            await quota_service.reconcile(
                db, prepared.reservation, actual_units=outcome.usage_units,
            )
        remaining = await quota_service.remaining_fraction(db, prepared.user_id)
    logger.info(
        "tutor turn settled: turn_id=%s status=%s units=%d reserved=%d",
        prepared.turn_id,
        outcome.status.value,
        outcome.usage_units,
        prepared.reservation.units,
    )
    return remaining
