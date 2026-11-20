"""What a turn reserves, in cost units -- one estimator for two callers.

``prepare_turn`` reserves ``reservation_for`` the prompt it is about to send.
GET /usage/today asks the same estimator whether the learner's NEXT turn would
fit, sized for the conversation they are in (its real history and goals) and
for the longest answer they may send, so "you can practice" and the
reservation agree. ``reserve`` stays the authoritative check.
"""
from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domain.languages import LANGUAGES, get_language, get_prompt_pack
from app.domain.levels import Level
from app.domain.scenarios import get_scenario, list_scenarios
from app.domain.tutoring.level_rules import rules_for
from app.models.tutor.tutor_session import TutorSession
from app.models.tutor.tutor_turn import TutorTurn
from app.repositories.tutor import tutor_session_repository, tutor_turn_repository
from app.schemas.tutor.turn_schemas import MAX_TURN_CHARS
from app.services.tutor.prompt_builder import (
    ClaudeRequest,
    HistoryTurn,
    SessionPromptContext,
    TurnPromptContext,
    build_corrections_request,
    build_reply_request,
)
from app.services.tutor.turn_errors import SessionNotFoundError
from app.services.tutor.usage_units import estimate_input_tokens, reservation_units

# Stands in for the learner's answer before it is known: the longest one allowed.
_LONGEST_ANSWER = "x" * MAX_TURN_CHARS


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


async def next_turn_prompt(
    db: AsyncSession, session: TutorSession, text: str,
) -> TurnPromptContext:
    """The prompt the session's next turn sends: its history window, goals met
    so far and turn number, with ``text`` as the learner's answer."""
    session_ctx = _session_prompt_context(
        session.language_code, session.scenario_slug, session.level,
    )
    recent = await tutor_turn_repository.list_recent_answered(
        db, session.id, session.user_id, limit=settings.ltutor_history_turns,
    )
    goals_met, since_retry = _progress_from_history(recent)
    return TurnPromptContext(
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


def reservation_for(reply: ClaudeRequest, corrections: ClaudeRequest) -> int:
    """Upper-bound cost units of one turn's three calls."""
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


def _prompt_units(prompt: TurnPromptContext) -> int:
    return reservation_for(build_reply_request(prompt), build_corrections_request(prompt))


def first_turn_units() -> int:
    """Reservation for the longest first answer (no history yet), for when the
    learner has no conversation open."""
    language_code = next(iter(LANGUAGES))
    scenario_slug = list_scenarios()[0].slug
    session_ctx = _session_prompt_context(language_code, scenario_slug, Level.BEGINNER.value)
    return _prompt_units(TurnPromptContext(session=session_ctx, learner_text=_LONGEST_ANSWER))


async def next_turn_units(db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID) -> int:
    """Reservation for the longest answer the learner could send next in this
    session. Raises ``SessionNotFoundError`` for a missing or another user's session."""
    session = await tutor_session_repository.get_by_id(db, session_id, user_id)
    if session is None:
        raise SessionNotFoundError("session not found")
    return _prompt_units(await next_turn_prompt(db, session, _LONGEST_ANSWER))
