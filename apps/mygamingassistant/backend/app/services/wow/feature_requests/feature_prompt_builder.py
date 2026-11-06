"""Build the refiner's user message: untrusted text, context, dedupe candidates.

Pure. The visitor's words are wrapped in ``<untrusted_*>`` tags with every
``<`` / ``>`` inside replaced by look-alike quotes, so the text can't close the
tag and pose as instructions. Candidates get short ids (S1..Sn); the mapper
turns ``duplicate_of`` back into a UUID only through ``candidate_ids``.
"""
import json
from collections.abc import Sequence

from app.core.wow_feature_request_limits import CANDIDATE_ID_PREFIX, DEDUPE_CANDIDATE_TEXT_CHARS
from app.schemas.wow.feature_requests.feature_context import FeatureRequestContext
from app.services.wow.feature_requests.built_prompt import BuiltPrompt
from app.services.wow.feature_requests.dedupe_candidate import DedupeCandidate
from app.services.wow.feature_requests.feature_text import clean_field

_TAG_NEUTRALIZE = str.maketrans({"<": "‹", ">": "›"})
_ANSWERED_NOTE = (
    "This is a FOLLOW-UP: you already asked a clarifying question and the visitor "
    "answered it below. Do not choose needs_clarification — write your best story."
)
_SKIPPED_NOTE = (
    "This is a FOLLOW-UP: you already asked a clarifying question and the visitor chose "
    "to skip it. Do not choose needs_clarification — write your best story from the "
    "submission alone."
)


def neutralize_tags(text: str) -> str:
    return text.translate(_TAG_NEUTRALIZE)


def _context_json(context: FeatureRequestContext | None) -> str:
    if context is None:
        return "{}"
    data = {key: value for key, value in context.model_dump().items() if value not in (None, [])}
    return json.dumps(data, sort_keys=True)


def _candidate_line(short_id: str, candidate: DedupeCandidate) -> str:
    summary = clean_field(f"{candidate.title} — {candidate.i_want}", DEDUPE_CANDIDATE_TEXT_CHARS) or ""
    return f"{short_id} [{candidate.area}] {neutralize_tags(summary)}"


def build_refiner_prompt(
    *,
    raw_text: str,
    clarification_answer: str | None,
    is_follow_up: bool,
    context: FeatureRequestContext | None,
    candidates: Sequence[DedupeCandidate],
) -> BuiltPrompt:
    candidate_ids = {f"{CANDIDATE_ID_PREFIX}{index}": c.id for index, c in enumerate(candidates, start=1)}
    candidate_lines = [
        _candidate_line(short_id, candidate)
        for short_id, candidate in zip(candidate_ids, candidates, strict=True)
    ]
    parts = [
        "Triage this feature request and call the tool once.",
        f"<visitor_context>{neutralize_tags(_context_json(context))}</visitor_context>",
        "<candidate_stories>",
        "\n".join(candidate_lines) if candidate_lines else "(none yet)",
        "</candidate_stories>",
        f"<untrusted_submission>\n{neutralize_tags(raw_text)}\n</untrusted_submission>",
    ]
    if is_follow_up and clarification_answer is None:
        parts.append(_SKIPPED_NOTE)
    elif is_follow_up:
        parts.append(_ANSWERED_NOTE)
        parts.append(
            f"<untrusted_clarification_answer>\n{neutralize_tags(clarification_answer)}\n"
            "</untrusted_clarification_answer>"
        )
    return BuiltPrompt(user_message="\n\n".join(parts), candidate_ids=candidate_ids)
