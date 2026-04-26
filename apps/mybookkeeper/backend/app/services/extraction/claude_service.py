import asyncio
import base64
import json
import logging
import time
import uuid
from dataclasses import dataclass

import anthropic
from anthropic import Timeout
from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.repositories import extraction_prompt_repo
from app.services.system.event_service import record_event
from app.services.extraction.prompts.base_prompt import DEFAULT_PROMPT
from app.services.extraction.prompts.document_type_addendums import get_addendum_for_filename

logger = logging.getLogger(__name__)

client = anthropic.AsyncAnthropic(
    api_key=settings.anthropic_api_key,
    timeout=Timeout(settings.claude_timeout_seconds, connect=30.0),
)


@dataclass
class _ThrottleState:
    consecutive_429s: int = 0
    resume_at: float = 0.0


_throttle = _ThrottleState()


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
) -> str:
    """Assemble extraction prompt: base + document-type addendum + property context + user-specific rules.

    DEFAULT_PROMPT is always the foundation. Document-type addendums provide
    focused instructions for specific form types. Property context narrows
    tax_relevant decisions. DB-stored rules are additive.
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
            async with AsyncSessionLocal() as db:  # Read-only — matches codebase pattern for service reads
                user_rules = await extraction_prompt_repo.get_active_for_user(db, user_id)
                if user_rules:
                    prompt = f"{prompt}\n\n# User-specific rules\n{user_rules.prompt_text}"
        except Exception:
            logger.warning("Failed to load user prompt rules, using base only", exc_info=True)

    return prompt


async def _create_with_backoff(**kwargs) -> anthropic.types.Message:
    now = time.monotonic()
    if now < _throttle.resume_at:
        delay = _throttle.resume_at - now
        logger.info("Throttle active, waiting %.0fs before Anthropic request", delay)
        await asyncio.sleep(delay)

    for attempt in range(5):
        try:
            result = await client.messages.create(**kwargs)
            _throttle.consecutive_429s = 0
            return result
        except anthropic.RateLimitError as e:
            _throttle.consecutive_429s += 1
            retry_after = getattr(getattr(e, "response", None), "headers", {}).get("retry-after")
            wait = float(retry_after) if retry_after else 60 * (2 ** attempt)
            _throttle.resume_at = time.monotonic() + wait
            logger.warning(
                "Rate limited by Anthropic, waiting %.0fs (attempt %d/5, consecutive 429s: %d)",
                wait, attempt + 1, _throttle.consecutive_429s,
            )
            try:
                await record_event(
                    None, "rate_limited", "warning",
                    f"Anthropic API rate limited (attempt {attempt + 1}/5, consecutive: {_throttle.consecutive_429s})",
                    {"wait_seconds": wait, "consecutive_429s": _throttle.consecutive_429s},
                )
            except Exception:
                pass
            if attempt == 4:
                raise
            await asyncio.sleep(wait)
    raise RuntimeError("unreachable")


async def extract_from_text(text: str, user_id: uuid.UUID | None = None, filename: str | None = None, property_classification: str | None = None) -> dict:
    prompt = await get_extraction_prompt(user_id, filename=filename, property_classification=property_classification)
    message = await _create_with_backoff(
        model="claude-sonnet-4-6",
        max_tokens=16384,
        system=[{"type": "text", "text": prompt, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": f"Document:\n{text[:settings.max_text_chars]}"}],
    )
    return _parse_response(message)


async def extract_from_image(image_bytes: bytes, media_type: str, user_id: uuid.UUID | None = None, filename: str | None = None, property_classification: str | None = None) -> dict:
    prompt = await get_extraction_prompt(user_id, filename=filename, property_classification=property_classification)
    file_b64 = base64.standard_b64encode(image_bytes).decode()

    is_pdf = media_type == "application/pdf"
    source_block: dict = {
        "type": "document" if is_pdf else "image",
        "source": {"type": "base64", "media_type": media_type, "data": file_b64},
    }

    message = await _create_with_backoff(
        model="claude-sonnet-4-6",
        max_tokens=16384,
        system=[{"type": "text", "text": prompt, "cache_control": {"type": "ephemeral"}}],
        messages=[{
            "role": "user",
            "content": [source_block],
        }],
    )
    return _parse_response(message)


async def extract_from_email(subject: str, body: str, user_id: uuid.UUID | None = None) -> dict:
    return await extract_from_text(f"Email Subject: {subject}\n\nEmail Body:\n{body[:settings.max_email_body_chars]}", user_id=user_id)


def _parse_response(message: anthropic.types.Message) -> dict:
    try:
        content = message.content[0].text.strip()
        # Extract JSON from markdown code blocks anywhere in the response
        if "```" in content:
            parts = content.split("```")
            for part in parts[1::2]:  # odd-indexed parts are inside code fences
                inner = part.strip()
                if inner.startswith("json"):
                    inner = inner[4:].strip()
                if inner.startswith("{"):
                    content = inner
                    break
        parsed = json.loads(content)
        input_tokens = message.usage.input_tokens
        output_tokens = message.usage.output_tokens
        tokens = input_tokens + output_tokens
        token_fields = {
            "tokens": tokens,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "model_name": message.model,
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
        return {
            "data": documents,
            **token_fields,
        }
    except (json.JSONDecodeError, IndexError, AttributeError) as e:
        raw_text = message.content[0].text[:500] if message.content else "EMPTY"
        logger.error("Failed to parse extraction response: %s — raw: %s", e, raw_text)
        return {
            "data": [{"tags": ["uncategorized"], "confidence": "low", "tax_relevant": False}],
            "tokens": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "model_name": None,
        }
