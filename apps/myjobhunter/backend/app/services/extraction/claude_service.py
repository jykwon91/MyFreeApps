"""Claude API client for MJH extraction tasks.

Mirrors MBK's ``app/services/extraction/claude_service.py`` but scoped
to MJH's extraction_logs table and prompt shapes.

Single entry point: ``extract_resume(text, user_id, job_id)`` — calls the
Anthropic API with the resume prompt, parses the JSON response, and records
token usage to ``extraction_logs``.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone

import anthropic
from anthropic import Timeout

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.system.extraction_log import ExtractionLog
from app.services.extraction.prompts.resume_prompt import RESUME_EXTRACTION_PROMPT

logger = logging.getLogger(__name__)

# Shared Anthropic async client — module-level singleton so connection
# pools are reused across worker iterations.
_client: anthropic.AsyncAnthropic | None = None

# Maximum resume text characters sent to Claude. Generous for resumes
# (most are <20 k chars) but bounded to prevent runaway token costs.
_MAX_TEXT_CHARS = 50_000

# Model to use for resume extraction.
_MODEL = "claude-sonnet-4-6"

# Max tokens in the response — the structured JSON reply is compact.
_MAX_TOKENS = 8192


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(
            api_key=settings.anthropic_api_key,
            timeout=Timeout(120.0, connect=30.0),
        )
    return _client


async def extract_resume(
    text: str,
    user_id: uuid.UUID,
    job_id: uuid.UUID,
) -> dict:
    """Call Claude to extract structured resume data from ``text``.

    Args:
        text: Plain text of the resume (from the text extractor).
        user_id: Scopes the extraction_log row.
        job_id: Polymorphic context_id in extraction_logs.

    Returns:
        Parsed dict matching the resume JSON schema (see resume_prompt.py).

    Raises:
        anthropic.APIError: on non-retryable API failures.
        ValueError: when Claude returns malformed JSON.
    """
    truncated = text[:_MAX_TEXT_CHARS]
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
                "text": RESUME_EXTRACTION_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{
                "role": "user",
                "content": f"Resume:\n{truncated}",
            }],
        )
        result = _parse_response(message)
        return result
    except Exception as exc:
        status = "error"
        error_message = str(exc)[:500]
        raise
    finally:
        duration_ms = int((time.monotonic() - started_at) * 1000)
        await _record_log(
            user_id=user_id,
            job_id=job_id,
            message=message,
            duration_ms=duration_ms,
            status=status,
            error_message=error_message,
        )


async def _call_with_backoff(**kwargs) -> anthropic.types.Message:
    for attempt in range(5):
        try:
            return await _get_client().messages.create(**kwargs)
        except anthropic.RateLimitError as exc:
            retry_after = getattr(
                getattr(exc, "response", None), "headers", {}
            ).get("retry-after")
            wait = float(retry_after) if retry_after else 60 * (2 ** attempt)
            logger.warning(
                "Anthropic rate-limited — waiting %.0fs (attempt %d/5)",
                wait, attempt + 1,
            )
            if attempt == 4:
                raise
            await asyncio.sleep(wait)
    raise RuntimeError("unreachable")


def _parse_response(message: anthropic.types.Message) -> dict:
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
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raw_preview = content[:300]
        logger.error("Failed to parse Claude resume response: %s — raw: %s", exc, raw_preview)
        raise ValueError(f"Claude returned invalid JSON: {exc}") from exc

    # Validate required keys — return defaults rather than crashing the worker
    # on unexpected schema drift.
    return {
        "work_history": parsed.get("work_history") or [],
        "education": parsed.get("education") or [],
        "skills": parsed.get("skills") or [],
        "summary": parsed.get("summary"),
        "headline": parsed.get("headline"),
    }


async def _record_log(
    user_id: uuid.UUID,
    job_id: uuid.UUID,
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

        # Cost estimate: sonnet-4-6 pricing
        # Input: $3 / 1M tokens, Output: $15 / 1M tokens (as of 2026-05)
        cost_usd: float | None = None
        if input_tokens is not None and output_tokens is not None:
            cost_usd = (input_tokens * 3 + output_tokens * 15) / 1_000_000

        async with AsyncSessionLocal() as db:
            log = ExtractionLog(
                user_id=user_id,
                context_type="resume_parse",
                context_id=job_id,
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
