"""Pure mapping: domain registry objects / ORM rows -> Pydantic responses."""
from __future__ import annotations

import json
import logging

from pydantic import JsonValue

from app.domain.languages import LanguageConfig
from app.domain.scenarios import Scenario
from app.models.tutor.tutor_session import TutorSession
from app.models.tutor.tutor_turn import TutorTurn
from app.schemas.tutor.catalog_schemas import LanguageResponse, ScenarioResponse
from app.schemas.tutor.session_schemas import (
    SessionDetailResponse,
    SessionSummary,
    TurnResponse,
)

logger = logging.getLogger(__name__)


def to_language_response(language: LanguageConfig) -> LanguageResponse:
    return LanguageResponse(
        code=language.code,
        display_name=language.display_name,
        dialect_label=language.dialect_label,
        stt_locale=language.stt_locale,
        tts_locale=language.tts_locale,
    )


def to_scenario_response(scenario: Scenario) -> ScenarioResponse:
    return ScenarioResponse(
        slug=scenario.slug,
        title=scenario.title,
        goal=scenario.goal,
        goals=list(scenario.goals),
        order=scenario.order,
    )


def parse_corrections(turn: TutorTurn) -> JsonValue | None:
    """Decode the stored corrections JSON. A corrupt value is surfaced as None
    rather than failing the whole transcript -- and is logged WITHOUT the text
    (transcripts are PII)."""
    if turn.corrections_json is None:
        return None
    try:
        return json.loads(turn.corrections_json)
    except json.JSONDecodeError:
        logger.warning("tutor_turn %s has undecodable corrections_json", turn.id)
        return None


def to_turn_response(turn: TutorTurn) -> TurnResponse:
    return TurnResponse(
        id=turn.id,
        seq=turn.seq,
        status=turn.status,
        learner_text=turn.learner_text,
        reply_text=turn.reply_text,
        corrections=parse_corrections(turn),
        translation_text=turn.translation_text,
        created_at=turn.created_at,
    )


def to_session_summary(session: TutorSession) -> SessionSummary:
    return SessionSummary.model_validate(session)


def to_session_detail(
    session: TutorSession, turns: list[TutorTurn],
) -> SessionDetailResponse:
    return SessionDetailResponse(
        **to_session_summary(session).model_dump(),
        turns=[to_turn_response(t) for t in turns],
    )
