"""Schemas for POST /sessions/{id}/turns (request + SSE event payloads) and
GET /usage/today.

SSE events, in order (``event:`` name -> ``data:`` JSON):

    turn.started   TurnStartedEvent
    reply.delta    ReplyDeltaEvent          (0..n)
    reply.done     {}                       (only when the reply finished)
    corrections    CorrectionsEvent         (only after reply.done)
    error          TurnErrorEvent           (instead of reply.done / corrections)
    done           TurnDoneEvent            (always last)

Mirrored in ``frontend/src/types/tutor/turn-events.ts`` -- change together.
"""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_TURN_CHARS = 500


class TurnCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=MAX_TURN_CHARS)

    @field_validator("text")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("text must not be blank")
        return stripped


class CorrectionItem(BaseModel):
    error_span: str
    corrected_span: str
    full_corrected_sentence: str
    error_type: str
    severity: str
    feedback_move: str
    explanation: str


class ScenarioState(BaseModel):
    goals_met: list[int]
    complete: bool


class TurnStartedEvent(BaseModel):
    turn_id: uuid.UUID
    seq: int


class ReplyDeltaEvent(BaseModel):
    text: str


class CorrectionsEvent(BaseModel):
    items: list[CorrectionItem]
    retry_prompt: str | None
    scenario_state: ScenarioState
    translation: str | None


class TurnErrorEvent(BaseModel):
    code: str
    """``tutor_busy`` (retry) | ``tutor_misconfigured`` | ``tutor_input_rejected``."""
    retryable: bool


class TurnUsage(BaseModel):
    remaining_fraction: float
    """Share of the learner's daily budget left after this turn (0.0-1.0)."""


class TurnDoneEvent(BaseModel):
    status: str
    """Final ``tutor_turn.status``: complete | partial | failed."""
    usage: TurnUsage


class UsageTodayResponse(BaseModel):
    remaining_fraction: float
    cap_reached: bool
    """True when today's remaining budget can't cover even a first turn."""
    tutor_available: bool
    """False when the tutor is switched off for everyone (no numbers leaked)."""
