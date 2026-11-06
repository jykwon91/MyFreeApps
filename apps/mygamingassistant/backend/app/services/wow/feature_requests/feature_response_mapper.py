"""Validate Claude's ``record_feature_request`` tool input into a RefinementResult.

Pure. Tool input is shaped by the schema, not guaranteed by it, so every field
is re-checked: enums, lengths, list sizes, and the output filter (no links,
HTML, markdown links or @handles — the story is public once approved). An
unusable field is replaced with a fallback and logged as one structured
WARNING naming the field and why (never the text), so a slightly-off answer
still reaches triage instead of failing the visitor.

Verdict rules:
- ``duplicate`` must name a short id that was in THIS prompt, else it's ``new``.
- A follow-up never returns ``needs_clarification`` (it becomes ``new``).
- ``new`` / ``duplicate`` always carry a story (built from fallbacks if needed).
"""
import logging
import re
import uuid
from typing import Any

from app.core.wow_feature_request_enums import (
    FALLBACK_AREA,
    FALLBACK_FEASIBILITY,
    FEASIBILITIES,
    STORY_AREAS,
    VERDICT_DUPLICATE,
    VERDICT_NEEDS_CLARIFICATION,
    VERDICT_NEW,
    VERDICT_REJECTED,
    VERDICTS,
)
from app.core.wow_feature_request_limits import (
    CANDIDATE_ID_PREFIX,
    CRITERIA_MAX_ITEMS,
    CRITERION_MAX,
    FALLBACK_PERSONA,
    FALLBACK_QUESTION,
    FALLBACK_STORY_TEXT,
    FALLBACK_TITLE,
    FEASIBILITY_NOTE_MAX,
    FOLLOW_UP_MAX,
    FOLLOW_UPS_MAX_ITEMS,
    I_WANT_MAX,
    NUANCE_NOTE_MAX,
    PERSONA_MAX,
    REASON_MAX,
    SO_THAT_MAX,
    TITLE_MAX,
    TOPIC_MAX,
)
from app.schemas.wow.feature_requests.refined_story import RefinedStory
from app.services.wow.feature_requests.feature_text import clean_field, has_forbidden_markup
from app.services.wow.feature_requests.refinement_result import RefinementResult

logger = logging.getLogger(__name__)

_FEASIBLE = "feasible"
# "As a hunter" -> "a hunter": the frontend renders "As {persona}".
_PERSONA_LEAD = re.compile(r"^as\s+(?=an?\s)", re.IGNORECASE)
_TOPIC_PATTERN = re.compile(r"^[a-z0-9][a-z0-9 _-]*$")
# A prompt-internal candidate id ("S3") means nothing to a visitor.
_CANDIDATE_ID = re.compile(rf"\b{CANDIDATE_ID_PREFIX}\d+\b")


def _coerced(field: str, reason: str) -> None:
    logger.warning("wow feature refiner: coerced field=%s reason=%s", field, reason)


def _public_text(raw: dict[str, Any], field: str, max_len: int) -> str | None:
    """Cleaned, filtered text — None (logged) when unusable; None silently when absent."""
    if raw.get(field) is None:
        return None
    value = clean_field(raw.get(field), max_len)
    if value is None:
        _coerced(field, "empty_or_not_text")
        return None
    if has_forbidden_markup(value):
        _coerced(field, "forbidden_markup")
        return None
    if _CANDIDATE_ID.search(value):
        _coerced(field, "names_candidate_id")
        return None
    return value


def _required_text(raw: dict[str, Any], field: str, max_len: int, fallback: str) -> str:
    if raw.get(field) is None:
        _coerced(field, "missing")
        return fallback
    return _public_text(raw, field, max_len) or fallback


def _text_list(raw: dict[str, Any], field: str, item_max: int, max_items: int) -> list[str]:
    values = raw.get(field)
    if values is None:
        return []
    if not isinstance(values, list):
        _coerced(field, "not_a_list")
        return []
    items: list[str] = []
    for value in values:
        item = clean_field(value, item_max)
        if item is None or has_forbidden_markup(item) or _CANDIDATE_ID.search(item):
            _coerced(field, "item_dropped")
            continue
        items.append(item)
    if len(items) > max_items:
        _coerced(field, "too_many_items")
    return items[:max_items]


def _enum(raw: dict[str, Any], field: str, allowed: tuple[str, ...], fallback: str) -> str:
    value = raw.get(field)
    if isinstance(value, str) and value in allowed:
        return value
    _coerced(field, "not_in_enum")
    return fallback


def _topic(raw: dict[str, Any]) -> str | None:
    value = _public_text(raw, "topic", TOPIC_MAX)
    if value is None:
        return None
    value = value.lower()
    if not _TOPIC_PATTERN.match(value):
        _coerced("topic", "bad_shape")
        return None
    return value


def map_story(raw: Any) -> RefinedStory:
    """A story from Claude's ``story`` object; fallbacks keep it reviewable."""
    if not isinstance(raw, dict):
        _coerced("story", "missing")
        raw = {}
    persona = _PERSONA_LEAD.sub("", _required_text(raw, "persona", PERSONA_MAX, FALLBACK_PERSONA))
    feasibility = _enum(raw, "feasibility", FEASIBILITIES, FALLBACK_FEASIBILITY)
    feasibility_note = None if feasibility == _FEASIBLE else _public_text(raw, "feasibility_note", FEASIBILITY_NOTE_MAX)
    return RefinedStory(
        title=_required_text(raw, "title", TITLE_MAX, FALLBACK_TITLE),
        persona=persona or FALLBACK_PERSONA,
        i_want=_required_text(raw, "i_want", I_WANT_MAX, FALLBACK_STORY_TEXT),
        so_that=_required_text(raw, "so_that", SO_THAT_MAX, FALLBACK_STORY_TEXT),
        acceptance_criteria=_text_list(raw, "acceptance_criteria", CRITERION_MAX, CRITERIA_MAX_ITEMS),
        follow_ups=_text_list(raw, "follow_ups", FOLLOW_UP_MAX, FOLLOW_UPS_MAX_ITEMS),
        area=_enum(raw, "area", STORY_AREAS, FALLBACK_AREA),
        topic=_topic(raw),
        feasibility=feasibility,
        feasibility_note=feasibility_note,
    )


def _duplicate_target(raw: dict[str, Any], candidate_ids: dict[str, uuid.UUID]) -> uuid.UUID | None:
    short_id = raw.get("duplicate_of")
    if isinstance(short_id, str):
        target = candidate_ids.get(short_id.strip().upper())
        if target is not None:
            return target
    _coerced("duplicate_of", "not_an_offered_candidate")
    return None


def map_refiner_output(
    raw: Any,
    *,
    candidate_ids: dict[str, uuid.UUID],
    is_follow_up: bool,
    model_id: str,
) -> RefinementResult:
    if not isinstance(raw, dict):
        _coerced("tool_input", "not_an_object")
        raw = {}
    verdict = raw.get("verdict")
    if not (isinstance(verdict, str) and verdict in VERDICTS):
        _coerced("verdict", "not_in_enum")
        verdict = VERDICT_NEW

    duplicate_of: uuid.UUID | None = None
    if verdict == VERDICT_DUPLICATE:
        duplicate_of = _duplicate_target(raw, candidate_ids)
        if duplicate_of is None:
            verdict = VERDICT_NEW
    if verdict == VERDICT_NEEDS_CLARIFICATION and is_follow_up:
        _coerced("verdict", "clarification_on_follow_up")
        verdict = VERDICT_NEW

    if verdict == VERDICT_NEEDS_CLARIFICATION:
        question = _public_text(raw, "question", REASON_MAX) or FALLBACK_QUESTION
        return RefinementResult(
            verdict=verdict, story=None, duplicate_of=None, nuance_note=None, reason=question, model_id=model_id
        )
    if verdict == VERDICT_REJECTED:
        # Private (triage only), so cleaned but never shown publicly.
        reason = clean_field(raw.get("reject_reason"), REASON_MAX)
        return RefinementResult(
            verdict=verdict, story=None, duplicate_of=None, nuance_note=None, reason=reason, model_id=model_id
        )
    nuance_note = _public_text(raw, "nuance_note", NUANCE_NOTE_MAX) if verdict == VERDICT_DUPLICATE else None
    return RefinementResult(
        verdict=verdict,
        story=map_story(raw.get("story")),
        duplicate_of=duplicate_of,
        nuance_note=nuance_note,
        reason=None,
        model_id=model_id,
    )
