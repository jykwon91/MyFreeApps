"""Validates the corrections model's JSON into the response we send and store.

Structured outputs make the shape schema-valid, but the model still decides
the content, so this mapper is the trust boundary:

* drops items with unknown enums, empty spans, or no actual change;
* enforces the level's correction dosage (keeps the N most severe);
* bounds every string's length;
* accepts goal indexes only inside the scenario's goal list and computes
  ``complete`` itself (the model never decides completion);
* never raises on bad model output -- the worst case is "no corrections".
"""
from __future__ import annotations

import json
import logging

from pydantic import BaseModel

from app.domain.tutoring.correction_vocabulary import (
    ERROR_TYPES,
    FEEDBACK_MOVES,
    SEVERITIES,
    SEVERITY_RANK,
)
from app.schemas.tutor.turn_schemas import CorrectionItem, ScenarioState

logger = logging.getLogger(__name__)

_MAX_SPAN_CHARS = 200
_MAX_SENTENCE_CHARS = 500
_MAX_EXPLANATION_CHARS = 240
_MAX_RETRY_PROMPT_CHARS = 300


class CorrectionsResult(BaseModel):
    """What one turn's review produced (stored as ``corrections_json``)."""

    items: list[CorrectionItem]
    retry_prompt: str | None
    scenario_state: ScenarioState


def _clean(value: object, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    text = " ".join(value.split())
    return text[:limit] if text else None


def _map_item(raw: object) -> CorrectionItem | None:
    if not isinstance(raw, dict):
        return None
    error_span = _clean(raw.get("error_span"), _MAX_SPAN_CHARS)
    corrected_span = _clean(raw.get("corrected_span"), _MAX_SPAN_CHARS)
    sentence = _clean(raw.get("full_corrected_sentence"), _MAX_SENTENCE_CHARS)
    explanation = _clean(raw.get("explanation"), _MAX_EXPLANATION_CHARS)
    error_type = raw.get("error_type")
    severity = raw.get("severity")
    move = raw.get("feedback_move")
    if not (error_span and corrected_span and sentence and explanation):
        return None
    if error_span.casefold() == corrected_span.casefold():
        return None
    if error_type not in ERROR_TYPES or severity not in SEVERITIES or move not in FEEDBACK_MOVES:
        return None
    return CorrectionItem(
        error_span=error_span,
        corrected_span=corrected_span,
        full_corrected_sentence=sentence,
        error_type=error_type,
        severity=severity,
        feedback_move=move,
        explanation=explanation,
    )


def scenario_state_for(goals_met: set[int], goal_count: int) -> ScenarioState:
    valid = sorted(i for i in goals_met if 0 <= i < goal_count)
    return ScenarioState(goals_met=valid, complete=goal_count > 0 and len(valid) == goal_count)


def map_corrections_output(
    raw: object,
    *,
    max_corrections: int,
    goal_count: int,
    prior_goals_met: tuple[int, ...],
) -> CorrectionsResult:
    """Map the model's parsed JSON (any shape) to a safe ``CorrectionsResult``."""
    data = raw if isinstance(raw, dict) else {}
    raw_items = data.get("corrections")
    items = [
        item
        for item in (_map_item(r) for r in (raw_items if isinstance(raw_items, list) else []))
        if item is not None
    ]
    items.sort(key=lambda item: SEVERITY_RANK[item.severity])
    items = items[:max(0, max_corrections)]

    retry_prompt = _clean(data.get("retry_prompt"), _MAX_RETRY_PROMPT_CHARS)
    # A retry prompt without a correction to retry makes no sense in the UI.
    if not items:
        retry_prompt = None

    raw_goals = data.get("goals_met_this_turn")
    new_goals = {
        g for g in (raw_goals if isinstance(raw_goals, list) else [])
        if isinstance(g, int) and not isinstance(g, bool)
    }
    state = scenario_state_for(set(prior_goals_met) | new_goals, goal_count)
    return CorrectionsResult(items=items, retry_prompt=retry_prompt, scenario_state=state)


def parse_model_json(text: str) -> object:
    """Parse the structured-output text block; invalid JSON -> ``{}`` (logged)."""
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        logger.warning("tutor corrections: model returned non-JSON output")
        return {}
