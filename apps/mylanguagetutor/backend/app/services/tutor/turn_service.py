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
turn under a shielded cancel scope (status ``partial`` or ``failed``, quota
reservation KEPT -- the tokens were already generated).

Never log transcript text -- ids, counts and Anthropic ``error.type`` only.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import anthropic
import anyio
from pydantic import BaseModel

from platform_shared.extraction.anthropic_errors import (
    AnthropicFailure,
    AnthropicFailureKind,
    map_anthropic_connection_error,
    map_anthropic_status_error,
)

from app.core.config import settings
from app.db.session import unit_of_work
from app.domain.languages import LANGUAGES, get_language, get_prompt_pack
from app.domain.levels import Level
from app.domain.scenarios import get_scenario, list_scenarios
from app.domain.session_status import SessionStatus
from app.domain.turn_status import TurnStatus
from app.domain.tutoring.level_rules import rules_for
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
from app.services.tutor import quota_service
from app.services.tutor.claude_client import get_client
from app.services.tutor.corrections_mapper import (
    CorrectionsResult,
    map_corrections_output,
    parse_model_json,
    scenario_state_for,
)
from app.services.tutor.prompt_builder import (
    ClaudeRequest,
    HistoryTurn,
    SessionPromptContext,
    TurnPromptContext,
    build_corrections_request,
    build_reply_request,
    build_translation_request,
)
from app.services.tutor.turn_errors import (
    SessionEndedError,
    SessionNotFoundError,
    SessionTurnLimitError,
)
from app.services.tutor.usage_units import (
    CallUsage,
    estimate_input_tokens,
    reservation_units,
    units_for,
)

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


@dataclass
class PreparedTurn:
    turn_id: uuid.UUID
    seq: int
    session_id: uuid.UUID
    user_id: uuid.UUID
    prompt: TurnPromptContext
    reply_request: ClaudeRequest
    corrections_request: ClaudeRequest
    reservation: quota_service.Reservation


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


# ---------------------------------------------------------------------------
# 1. Prepare (pre-stream transaction)
# ---------------------------------------------------------------------------


def _session_prompt_context(language_code: str, scenario_slug: str, level: str) -> SessionPromptContext:
    language = get_language(language_code)
    pack = get_prompt_pack(language_code)
    scenario = get_scenario(scenario_slug)
    if language is None or pack is None or scenario is None:
        # The CHECK constraints make this unreachable; fail as "not found"
        # rather than calling Claude with a half-built prompt.
        raise SessionNotFoundError(f"unsupported session config {language_code}/{scenario_slug}")
    return SessionPromptContext(
        language=language, pack=pack, scenario=scenario, rules=rules_for(level),
    )


def _stored_corrections(turn: TutorTurn) -> dict[str, Any]:
    if not turn.corrections_json:
        return {}
    try:
        data = json.loads(turn.corrections_json)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _progress_from_history(turns: list[TutorTurn]) -> tuple[tuple[int, ...], int | None]:
    """(goals met so far, learner turns since the last retry prompt).

    ``scenario_state`` is cumulative, so the newest turn that has one wins.
    ``None`` for the retry distance = no retry prompt in the history window.
    """
    goals: tuple[int, ...] | None = None
    since_retry: int | None = None
    for distance, turn in enumerate(reversed(turns), start=1):
        data = _stored_corrections(turn)
        state = data.get("scenario_state")
        if goals is None and isinstance(state, dict) and isinstance(state.get("goals_met"), list):
            goals = tuple(g for g in state["goals_met"] if isinstance(g, int))
        if since_retry is None and data.get("retry_prompt"):
            since_retry = distance
        if goals is not None and since_retry is not None:
            break
    return goals or (), since_retry


def _reservation_for(prompt: TurnPromptContext, reply: ClaudeRequest, corrections: ClaudeRequest) -> int:
    reply_units = reservation_units(
        input_tokens_est=estimate_input_tokens(reply.prompt_chars()),
        max_tokens=settings.ltutor_reply_max_tokens,
        weight=settings.ltutor_reply_unit_weight,
    )
    corrections_units = reservation_units(
        input_tokens_est=estimate_input_tokens(corrections.prompt_chars()),
        max_tokens=settings.ltutor_corrections_max_tokens,
        weight=settings.ltutor_corrections_unit_weight,
    )
    # The translation's input is the reply itself (<= reply max_tokens).
    translation_units = reservation_units(
        input_tokens_est=estimate_input_tokens(0) + settings.ltutor_reply_max_tokens,
        max_tokens=settings.ltutor_translation_max_tokens,
        weight=settings.ltutor_translation_unit_weight,
    )
    return reply_units + corrections_units + translation_units


def minimum_turn_units() -> int:
    """Reservation for a short first turn (no history) -- roughly the cheapest
    turn possible. Used by GET /usage/today to say whether another turn can
    start; ``reserve`` stays the authoritative check."""
    language_code = next(iter(LANGUAGES))
    scenario_slug = list_scenarios()[0].slug
    session_ctx = _session_prompt_context(language_code, scenario_slug, Level.BEGINNER.value)
    prompt = TurnPromptContext(session=session_ctx, learner_text="x" * 40)
    return _reservation_for(prompt, build_reply_request(prompt), build_corrections_request(prompt))


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
        if session.turn_count >= settings.ltutor_max_turns_per_session:
            raise SessionTurnLimitError("session turn limit reached")

        session_ctx = _session_prompt_context(
            session.language_code, session.scenario_slug, session.level,
        )
        recent = await tutor_turn_repository.list_recent_answered(
            db, session_id, user_id, limit=settings.ltutor_history_turns,
        )
        goals_met, since_retry = _progress_from_history(recent)
        prompt = TurnPromptContext(
            session=session_ctx,
            learner_text=text,
            history=tuple(
                HistoryTurn(learner_text=t.learner_text, reply_text=t.reply_text or "")
                for t in recent
            ),
            goals_met=goals_met,
            turn_number=session.turn_count + 1,
            max_turns=settings.ltutor_max_turns_per_session,
            turns_since_retry_prompt=since_retry,
        )
        reply_request = build_reply_request(prompt)
        corrections_request = build_corrections_request(prompt)
        seq = await tutor_turn_repository.next_seq(db, session_id)
        reservation = await quota_service.reserve(
            db,
            user_id=user_id,
            units=_reservation_for(prompt, reply_request, corrections_request),
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
# 2. Claude calls
# ---------------------------------------------------------------------------


def _classify(exc: Exception, log_prefix: str) -> AnthropicFailure:
    if isinstance(exc, anthropic.APIStatusError):
        return map_anthropic_status_error(exc, log_prefix=log_prefix, logger=logger)
    return map_anthropic_connection_error(
        exc,  # type: ignore[arg-type]
        log_prefix=log_prefix,
        logger=logger,
    )


def _first_text(message: Any) -> str:
    for block in getattr(message, "content", None) or []:
        if getattr(block, "type", None) == "text":
            return str(getattr(block, "text", ""))
    return ""


async def _run_corrections(
    client: anthropic.AsyncAnthropic, prepared: PreparedTurn,
) -> tuple[CorrectionsResult | None, CallUsage]:
    """The corrections call. Never raises: it is off the critical path, so a
    failure degrades to "no correction card" (logged, with its error.type)."""
    request = prepared.corrections_request
    try:
        message = await client.messages.create(
            model=settings.ltutor_corrections_model,
            max_tokens=settings.ltutor_corrections_max_tokens,
            system=request.system,
            messages=request.messages,
            **request.extra,
        )
    except (anthropic.APIStatusError, anthropic.APIConnectionError) as exc:
        _classify(exc, "tutor corrections")
        return None, CallUsage()
    usage = CallUsage.from_api(getattr(message, "usage", None))
    session = prepared.prompt.session
    result = map_corrections_output(
        parse_model_json(_first_text(message)),
        max_corrections=session.rules.max_corrections,
        goal_count=len(session.scenario.goals),
        prior_goals_met=prepared.prompt.goals_met,
    )
    return result, usage


async def _run_translation(
    client: anthropic.AsyncAnthropic, prepared: PreparedTurn, reply_text: str,
) -> tuple[str | None, CallUsage]:
    """English translation of the finished reply. Never raises (degrades to None)."""
    request = build_translation_request(prepared.prompt.session.language, reply_text)
    try:
        message = await client.messages.create(
            model=settings.ltutor_translation_model,
            max_tokens=settings.ltutor_translation_max_tokens,
            system=request.system,
            messages=request.messages,
        )
    except (anthropic.APIStatusError, anthropic.APIConnectionError) as exc:
        _classify(exc, "tutor translation")
        return None, CallUsage()
    text = " ".join(_first_text(message).split())
    return (text or None), CallUsage.from_api(getattr(message, "usage", None))


def _units(reply: CallUsage, corrections: CallUsage, translation: CallUsage) -> int:
    return (
        units_for(reply, weight=settings.ltutor_reply_unit_weight)
        + units_for(corrections, weight=settings.ltutor_corrections_unit_weight)
        + units_for(translation, weight=settings.ltutor_translation_unit_weight)
    )


async def _cancel(task: asyncio.Task[Any] | None) -> None:
    if task is None or task.done():
        return
    task.cancel()
    try:
        await task
    except (asyncio.CancelledError, Exception):  # noqa: BLE001 -- being discarded
        pass


def _corrections_usage_if_done(task: asyncio.Task[tuple[CorrectionsResult | None, CallUsage]]) -> CallUsage:
    if task.done() and not task.cancelled() and task.exception() is None:
        return task.result()[1]
    return CallUsage()


# ---------------------------------------------------------------------------
# 3. Stream
# ---------------------------------------------------------------------------


async def stream_turn(prepared: PreparedTurn) -> AsyncIterator[TurnEvent]:
    """Yield the turn's SSE events. Always ends with ``done`` unless the
    client disconnects (then the turn is settled in ``finally``)."""
    client = get_client()
    outcome: _Outcome | None = None
    settle_attempted = False
    reply_parts: list[str] = []
    corrections_task: asyncio.Task[tuple[CorrectionsResult | None, CallUsage]] | None = None
    translation_task: asyncio.Task[tuple[str | None, CallUsage]] | None = None
    try:
        yield TurnEvent(EVENT_TURN_STARTED, TurnStartedEvent(turn_id=prepared.turn_id, seq=prepared.seq))
        corrections_task = asyncio.create_task(_run_corrections(client, prepared))

        reply_usage = CallUsage()
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
            failure = _classify(exc, "tutor reply")

        reply_text = "".join(reply_parts).strip()
        if failure is not None or not reply_text:
            await _cancel(corrections_task)
            corrections_usage = _corrections_usage_if_done(corrections_task)
            if failure is None:
                logger.warning("tutor reply: empty reply turn_id=%s", prepared.turn_id)
                code, retryable = _EMPTY_REPLY_CODE, True
            else:
                code, retryable = _ERROR_CODES[failure.kind]
            if reply_parts:
                # Cut off mid-stream: tokens were billed but uncounted.
                outcome = _Outcome(
                    status=TurnStatus.PARTIAL,
                    settlement=_Settlement.KEEP,
                    reply_text=reply_text or None,
                )
            else:
                # Nothing streamed: charge only what we know was used (the
                # corrections call, if it had already finished) -- for a
                # pre-token upstream error that is usually a full refund.
                outcome = _Outcome(
                    status=TurnStatus.FAILED,
                    settlement=_Settlement.RECONCILE,
                    usage=reply_usage + corrections_usage,
                    usage_units=_units(reply_usage, corrections_usage, CallUsage()),
                )
            yield TurnEvent(EVENT_ERROR, TurnErrorEvent(code=code, retryable=retryable))
        else:
            yield TurnEvent(EVENT_REPLY_DONE, _EmptyPayload())
            translation_task = asyncio.create_task(_run_translation(client, prepared, reply_text))
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
                usage_units=_units(reply_usage, corrections_usage, translation_usage),
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
        remaining = await _settle(prepared, outcome)
        yield TurnEvent(
            EVENT_DONE,
            TurnDoneEvent(status=outcome.status.value, usage=TurnUsage(remaining_fraction=remaining)),
        )
    finally:
        # Shielded: on client disconnect this runs inside a cancelled anyio
        # scope, where every unshielded await would be cancelled again.
        with anyio.CancelScope(shield=True):
            await _cancel(corrections_task)
            await _cancel(translation_task)
            if not settle_attempted:
                # Client went away (or an unexpected error) before settlement:
                # record what we have and KEEP the reservation.
                reply_text = "".join(reply_parts).strip()
                abandoned = _Outcome(
                    status=TurnStatus.PARTIAL if reply_text else TurnStatus.FAILED,
                    settlement=_Settlement.KEEP,
                    reply_text=reply_text or None,
                )
                logger.info(
                    "tutor turn abandoned before settlement: turn_id=%s", prepared.turn_id,
                )
                await _settle(prepared, abandoned)


# ---------------------------------------------------------------------------
# 4. Settle (post-stream transaction)
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
