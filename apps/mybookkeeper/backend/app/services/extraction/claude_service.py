"""MyBookkeeper extraction wrapper around platform_shared.extraction.

The generic Anthropic-call machinery (client, throttle, 429 backoff,
JSON-from-response parsing) now lives in ``platform_shared.extraction``.
This module keeps only the MyBookkeeper-domain pieces:

- ``get_extraction_prompt`` — DEFAULT_PROMPT + document-type addendum +
  property context + DB-stored per-user rules. Unchanged.
- The MBK response interpretation (year_end_statement special-case,
  ``documents``/``invoices`` unwrap, low-confidence fallback dict on any
  parse/shape failure) — the exact pre-extraction return contract, so
  every caller (document_extraction_service, email_extraction_service,
  persistence) sees byte-identical dicts.
- ``_create_with_backoff`` — kept as a thin passthrough because
  ``app.services.tax.tax_advisor_service`` imports it for non-extraction
  Claude calls; it must keep using the same shared throttle.
- ``_ThrottleState`` / ``_throttle`` — re-exported (test_self_healing
  imports them) and ARE the shared throttle objects, so backoff state is
  process-global exactly as before.

Model is pinned to ``claude-sonnet-4-6``: changing it would alter
extraction output AND cold-start the production prompt cache (caching is
a prefix match keyed on model + system bytes).
"""
import logging
import uuid

import anthropic
from anthropic import Timeout
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.repositories import extraction_prompt_repo
from app.services.extraction.prompts.base_prompt import DEFAULT_PROMPT
from app.services.extraction.prompts.document_type_addendums import get_addendum_for_filename
from app.services.system.event_service import record_event
from platform_shared.extraction import (
    ExtractionParseError,
    ExtractionResponse,
    ExtractionService,
    RateLimitEvent,
    ThrottleState as _ThrottleState,  # re-exported: test_self_healing imports this
    create_with_backoff,
    throttle as _throttle,  # re-exported: same process-global throttle as before
)

# Public + back-compat surface. _ThrottleState / _throttle are
# re-exports of the shared throttle objects, kept importable here
# because app.services.tax.tax_advisor_service and tests/test_self_healing
# import them from this module path.
__all__ = [
    "get_extraction_prompt",
    "extract_from_text",
    "extract_from_image",
    "extract_from_email",
    "_create_with_backoff",
    "_ThrottleState",
    "_throttle",
    "PROPERTY_CONTEXT_ADDENDUMS",
]

logger = logging.getLogger(__name__)

# Shared by extraction AND tax_advisor (via _create_with_backoff) — one
# client / one throttle, exactly the pre-extraction behaviour.
client = anthropic.AsyncAnthropic(
    api_key=settings.anthropic_api_key,
    timeout=Timeout(settings.claude_timeout_seconds, connect=30.0),
)

_MODEL = "claude-sonnet-4-6"

_extraction = ExtractionService(
    api_key=settings.anthropic_api_key,
    model=_MODEL,
    timeout_seconds=settings.claude_timeout_seconds,
)


PROPERTY_CONTEXT_ADDENDUMS: dict[str, str] = {
    "investment": (
        "\n\n# Property context\n"
        "This document relates to an INVESTMENT PROPERTY (rental). "
        "Expenses are deductible on Schedule E. Set tax_relevant to true for all property-related expenses."
    ),
    "primary_residence": (
        "\n\n# Property context\n"
        "This document relates to a PRIMARY RESIDENCE (owner-occupied home). "
        "Only mortgage interest and property taxes are deductible (Schedule A). "
        "Other expenses (utilities, maintenance, insurance) are personal and NOT tax-deductible. "
        "Set tax_relevant to false for non-deductible personal expenses."
    ),
    "second_home": (
        "\n\n# Property context\n"
        "This document relates to a SECOND HOME (vacation/personal use). "
        "Only mortgage interest and property taxes are deductible (Schedule A). "
        "Other expenses are personal and NOT tax-deductible. "
        "Set tax_relevant to false for non-deductible personal expenses."
    ),
}


async def get_extraction_prompt(
    user_id: uuid.UUID | None = None,
    filename: str | None = None,
    property_classification: str | None = None,
) -> tuple[str, str | None]:
    """Assemble extraction prompt: base + document-type addendum + property context + user-specific rules.

    DEFAULT_PROMPT is always the foundation. Document-type addendums provide
    focused instructions for specific form types. Property context narrows
    tax_relevant decisions. DB-stored rules are additive.

    Returns (prompt, error_tag) where error_tag is None on success or
    "user_rules_db_error" when the DB call to load user rules fails.
    """
    prompt = DEFAULT_PROMPT

    if filename:
        addendum = get_addendum_for_filename(filename)
        if addendum:
            prompt = f"{prompt}\n{addendum}"

    if property_classification:
        ctx_addendum = PROPERTY_CONTEXT_ADDENDUMS.get(property_classification.lower())
        if ctx_addendum:
            prompt = f"{prompt}{ctx_addendum}"

    if user_id:
        try:
            async with AsyncSessionLocal() as db:
                user_rules = await extraction_prompt_repo.get_active_for_user(db, user_id)
                if user_rules:
                    prompt = f"{prompt}\n\n# User-specific rules\n{user_rules.prompt_text}"
        except SQLAlchemyError as e:
            logger.warning(
                "claude prompt: failed to load user rules type=%s msg=%s — falling back to base prompt",
                type(e).__name__, str(e),
            )
            return prompt, "user_rules_db_error"

    return prompt, None


async def _record_rate_limited(evt: RateLimitEvent) -> None:
    """Record the MBK system event on each 429 — the exact pre-extraction payload.

    create_with_backoff already wraps this in a try/except-and-log, so a
    failing event write never breaks the backoff (prior behaviour).
    """
    await record_event(
        None,
        "rate_limited",
        "warning",
        f"Anthropic API rate limited (attempt {evt.attempt}/{evt.max_attempts}, "
        f"consecutive: {evt.consecutive_429s})",
        {"wait_seconds": evt.wait_seconds, "consecutive_429s": evt.consecutive_429s},
    )


async def _create_with_backoff(**kwargs) -> anthropic.types.Message:
    """Thin passthrough kept for app.services.tax.tax_advisor_service.

    Preserves the pre-extraction surface: same module ``client``, same
    process-global throttle, same rate-limit event recording.
    """
    return await create_with_backoff(client, on_rate_limit=_record_rate_limited, **kwargs)


def _legacy_fallback() -> dict:
    return {
        "data": [{"tags": ["uncategorized"], "confidence": "low", "tax_relevant": False}],
        "tokens": 0,
        "input_tokens": 0,
        "output_tokens": 0,
        "model_name": None,
    }


def _legacy_from_response(resp: ExtractionResponse) -> dict:
    """Reproduce the pre-extraction _parse_response success mapping exactly.

    Raises AttributeError if ``resp.data`` is not a dict (e.g. the model
    returned a bare JSON list) — the caller catches that and returns the
    low-confidence fallback, exactly as the pre-extraction code did.
    """
    parsed = resp.data
    token_fields = {
        "tokens": resp.total_tokens,
        "input_tokens": resp.input_tokens,
        "output_tokens": resp.output_tokens,
        "model_name": resp.model,
    }

    if parsed.get("document_type") == "year_end_statement":
        return {
            "data": [],
            "document_type": "year_end_statement",
            "reservations": parsed.get("reservations", []),
            **token_fields,
        }

    if "documents" in parsed:
        documents = parsed["documents"]
    elif "invoices" in parsed:
        documents = parsed["invoices"]
    else:
        documents = [parsed]
    return {"data": documents, **token_fields}


def _to_legacy(resp: ExtractionResponse) -> dict:
    try:
        return _legacy_from_response(resp)
    except (AttributeError, KeyError, TypeError):
        return _legacy_fallback()


async def extract_from_text(text: str, user_id: uuid.UUID | None = None, filename: str | None = None, property_classification: str | None = None) -> dict:
    prompt, err = await get_extraction_prompt(user_id, filename=filename, property_classification=property_classification)
    if err:
        logger.warning("extract_from_text: proceeding without user rules (error=%s user_id=%s)", err, user_id)
    try:
        resp = await _extraction.extract_text(
            prompt,
            text[:settings.max_text_chars],
            on_rate_limit=_record_rate_limited,
        )
    except ExtractionParseError:
        return _legacy_fallback()
    return _to_legacy(resp)


async def extract_from_image(image_bytes: bytes, media_type: str, user_id: uuid.UUID | None = None, filename: str | None = None, property_classification: str | None = None) -> dict:
    prompt, err = await get_extraction_prompt(user_id, filename=filename, property_classification=property_classification)
    if err:
        logger.warning("extract_from_image: proceeding without user rules (error=%s user_id=%s)", err, user_id)
    try:
        resp = await _extraction.extract_document(
            prompt,
            image_bytes,
            media_type,
            on_rate_limit=_record_rate_limited,
        )
    except ExtractionParseError:
        return _legacy_fallback()
    return _to_legacy(resp)


async def extract_from_email(subject: str, body: str, user_id: uuid.UUID | None = None) -> dict:
    return await extract_from_text(f"Email Subject: {subject}\n\nEmail Body:\n{body[:settings.max_email_body_chars]}", user_id=user_id)
