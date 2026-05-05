"""Claude API client for MJH extraction tasks.

Two entry points:
- ``call_claude(system_prompt, user_content, context_type, user_id, context_id)``
  — generic Claude call. Used by jd_parsing_service.parse_jd, future cover-letter
  generator, etc.
- ``extract_resume(text, user_id, job_id)`` — thin wrapper around ``call_claude``
  for the resume parser worker; pins the resume system prompt and applies the
  resume-specific defaults dict-shape on the response.

Both share the same singleton Anthropic client, exponential backoff on rate
limits, and best-effort extraction_logs recording.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import anthropic
from anthropic import Timeout

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.system.extraction_log import ExtractionLog
from app.services.extraction.prompts.resume_prompt import RESUME_EXTRACTION_PROMPT

logger = logging.getLogger(__name__)

# Shared Anthropic async client — module-level singleton so connection pools
# are reused across calls.
_client: anthropic.AsyncAnthropic | None = None

# Model used for all extraction tasks.
_MODEL = "claude-sonnet-4-6"

# Max tokens in the response — the structured JSON reply is compact.
_MAX_TOKENS = 8192

# Maximum text characters sent to Claude. Generous for resumes / JDs (most
# are <20 k chars) but bounded to prevent runaway token costs.
_MAX_TEXT_CHARS = 50_000


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(
            api_key=settings.anthropic_api_key,
            timeout=Timeout(120.0, connect=30.0),
        )
    return _client


async def call_claude(
    *,
    system_prompt: str,
    user_content: str,
    context_type: str,
    user_id: uuid.UUID,
    context_id: uuid.UUID | None = None,
) -> dict:
    """Call Claude with a system prompt and return the parsed JSON response.

    Args:
        system_prompt: The extraction instruction (e.g. JD_PARSING_PROMPT).
        user_content: The raw text to extract from (e.g. pasted JD text).
        context_type: Logged to extraction_logs (e.g. "jd_parse",
            "resume_parse").
        user_id: Scopes the extraction_log row.
        context_id: Polymorphic FK for the extraction_logs row; pass the
            application/job ID when available, else None.

    Returns:
        Parsed dict from Claude's JSON response.

    Raises:
        anthropic.APIError: on non-retryable API failures after backoff.
        ValueError: when Claude returns malformed JSON after all retries.
    """
    result = await call_claude_with_meta(
        system_prompt=system_prompt,
        user_content=user_content,
        context_type=context_type,
        user_id=user_id,
        context_id=context_id,
    )
    return result["parsed"]


async def call_claude_with_meta(
    *,
    system_prompt: str,
    user_content: str,
    context_type: str,
    user_id: uuid.UUID,
    context_id: uuid.UUID | None = None,
) -> dict:
    """Same as ``call_claude`` but returns parsed + token + cost meta.

    Returns a dict with keys:
        - ``parsed``: dict — the parsed JSON response.
        - ``input_tokens``: int — usage.input_tokens (0 if unavailable).
        - ``output_tokens``: int — usage.output_tokens (0 if unavailable).
        - ``cost_usd``: Decimal — computed via the same pricing used by
          ``_record_log``.

    Used by the resume-refinement service to track per-session token /
    cost totals on the session row.
    """
    truncated = user_content[:_MAX_TEXT_CHARS]
    started_at = time.monotonic()
    status = "success"
    error_message: str | None = None
    message: anthropic.types.Message | None = None

    try:
        message = await _call_with_backoff(
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            system=[{
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{
                "role": "user",
                "content": truncated,
            }],
        )
        parsed = _parse_json_response(message)
        input_tokens = message.usage.input_tokens if message and message.usage else 0
        output_tokens = message.usage.output_tokens if message and message.usage else 0
        cost_usd = Decimal(input_tokens * 3 + output_tokens * 15) / Decimal(1_000_000)
        return {
            "parsed": parsed,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost_usd,
        }
    except Exception as exc:
        status = "error"
        error_message = str(exc)[:500]
        raise
    finally:
        duration_ms = int((time.monotonic() - started_at) * 1000)
        await _record_log(
            user_id=user_id,
            context_id=context_id,
            context_type=context_type,
            message=message,
            duration_ms=duration_ms,
            status=status,
            error_message=error_message,
        )


async def extract_resume(
    text: str,
    user_id: uuid.UUID,
    job_id: uuid.UUID,
) -> dict:
    """Call Claude to extract structured resume data from ``text``.

    Thin wrapper around ``call_claude`` that pins the resume system prompt
    and normalises the response dict to the resume schema (defaults for
    missing keys so a schema drift doesn't crash the worker).
    """
    parsed = await call_claude(
        system_prompt=RESUME_EXTRACTION_PROMPT,
        user_content=f"Resume:\n{text}",
        context_type="resume_parse",
        user_id=user_id,
        context_id=job_id,
    )
    return {
        "work_history": parsed.get("work_history") or [],
        "education": parsed.get("education") or [],
        "skills": parsed.get("skills") or [],
        "summary": parsed.get("summary"),
        "headline": parsed.get("headline"),
    }


async def _call_with_backoff(**kwargs: object) -> anthropic.types.Message:
    """Call the Anthropic API with exponential backoff on rate-limit errors."""
    for attempt in range(5):
        try:
            return await _get_client().messages.create(**kwargs)  # type: ignore[arg-type]
        except anthropic.RateLimitError as exc:
            retry_after = getattr(
                getattr(exc, "response", None), "headers", {}
            ).get("retry-after")
            wait = float(retry_after) if retry_after else 60.0 * (2 ** attempt)
            logger.warning(
                "Anthropic rate-limited — waiting %.0fs (attempt %d/5)",
                wait,
                attempt + 1,
            )
            if attempt == 4:
                raise
            await asyncio.sleep(wait)
    raise RuntimeError("unreachable")


def _parse_json_response(message: anthropic.types.Message) -> dict:
    """Extract and parse the JSON payload from a Claude Message."""
    content = message.content[0].text.strip() if message.content else ""

    # Strip markdown code fences if Claude wraps the JSON.
    if "```" in content:
        for part in content.split("```")[1::2]:
            inner = part.strip()
            if inner.startswith("json"):
                inner = inner[4:].strip()
            if inner.startswith("{"):
                content = inner
                break

    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        raw_preview = content[:300]
        logger.error(
            "Failed to parse Claude response as JSON: %s — raw: %s",
            exc,
            raw_preview,
        )
        raise ValueError(f"Claude returned invalid JSON: {exc}") from exc


async def _record_log(
    *,
    user_id: uuid.UUID,
    context_id: uuid.UUID | None,
    context_type: str,
    message: anthropic.types.Message | None,
    duration_ms: int,
    status: str,
    error_message: str | None,
) -> None:
    """Write a row to extraction_logs. Best-effort — never raises."""
    try:
        input_tokens = message.usage.input_tokens if message else None
        output_tokens = message.usage.output_tokens if message else None
        model_name = message.model if message else _MODEL

        # Cost estimate: claude-sonnet-4-6 pricing.
        # Input: $3 / 1M tokens, Output: $15 / 1M tokens (as of 2026-05).
        cost_usd: float | None = None
        if input_tokens is not None and output_tokens is not None:
            cost_usd = (input_tokens * 3 + output_tokens * 15) / 1_000_000

        async with AsyncSessionLocal() as db:
            log = ExtractionLog(
                user_id=user_id,
                context_type=context_type,
                context_id=context_id,
                model=model_name,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=cost_usd,
                duration_ms=duration_ms,
                status=status,
                error_message=error_message,
                created_at=datetime.now(timezone.utc),
            )
            db.add(log)
            await db.commit()
    except Exception:
        logger.warning("Failed to record extraction log", exc_info=True)
