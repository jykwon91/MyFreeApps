"""The Claude calls a turn makes besides the streamed reply, and the bookkeeping around them.

The corrections and translation calls never raise: they are off the critical path, so a failure
degrades to no correction card / no translation (logged with its Anthropic ``error.type``).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import anthropic

from platform_shared.extraction.anthropic_errors import (
    AnthropicFailure,
    map_anthropic_connection_error,
    map_anthropic_status_error,
)

from app.core.config import settings
from app.services.tutor.corrections_mapper import (
    CorrectionsResult,
    map_corrections_output,
    parse_model_json,
)
from app.services.tutor.prepared_turn import PreparedTurn
from app.services.tutor.prompt_builder import build_translation_request
from app.services.tutor.usage_units import CallUsage, units_for

logger = logging.getLogger(__name__)


def classify_failure(exc: Exception, log_prefix: str) -> AnthropicFailure:
    """Maps an Anthropic error to the failure kind, logging its ``error.type``."""
    if isinstance(exc, anthropic.APIStatusError):
        return map_anthropic_status_error(exc, log_prefix=log_prefix, logger=logger)
    return map_anthropic_connection_error(
        exc,  # type: ignore[arg-type]
        log_prefix=log_prefix,
        logger=logger,
    )


def _first_text(message: Any) -> str:
    for block in getattr(message, "content", None) or []:
        if getattr(block, "type", None) == "text":
            return str(getattr(block, "text", ""))
    return ""


async def run_corrections(
    client: anthropic.AsyncAnthropic, prepared: PreparedTurn,
) -> tuple[CorrectionsResult | None, CallUsage]:
    """The corrections call. Never raises: it is off the critical path, so a
    failure degrades to "no correction card" (logged, with its error.type)."""
    request = prepared.corrections_request
    try:
        message = await client.messages.create(
            model=settings.ltutor_corrections_model,
            max_tokens=settings.ltutor_corrections_max_tokens,
            system=request.system,
            messages=request.messages,
            **request.extra,
        )
    except (anthropic.APIStatusError, anthropic.APIConnectionError) as exc:
        classify_failure(exc, "tutor corrections")
        return None, CallUsage()
    usage = CallUsage.from_api(getattr(message, "usage", None))
    session = prepared.prompt.session
    result = map_corrections_output(
        parse_model_json(_first_text(message)),
        max_corrections=session.rules.max_corrections,
        goal_count=len(session.scenario.goals),
        prior_goals_met=prepared.prompt.goals_met,
    )
    return result, usage


async def run_translation(
    client: anthropic.AsyncAnthropic, prepared: PreparedTurn, reply_text: str,
) -> tuple[str | None, CallUsage]:
    """English translation of the finished reply. Never raises (degrades to None)."""
    request = build_translation_request(prepared.prompt.session.language, reply_text)
    try:
        message = await client.messages.create(
            model=settings.ltutor_translation_model,
            max_tokens=settings.ltutor_translation_max_tokens,
            system=request.system,
            messages=request.messages,
        )
    except (anthropic.APIStatusError, anthropic.APIConnectionError) as exc:
        classify_failure(exc, "tutor translation")
        return None, CallUsage()
    text = " ".join(_first_text(message).split())
    return (text or None), CallUsage.from_api(getattr(message, "usage", None))


def turn_units(reply: CallUsage, corrections: CallUsage, translation: CallUsage) -> int:
    return (
        units_for(reply, weight=settings.ltutor_reply_unit_weight)
        + units_for(corrections, weight=settings.ltutor_corrections_unit_weight)
        + units_for(translation, weight=settings.ltutor_translation_unit_weight)
    )


async def cancel_task(task: asyncio.Task[Any] | None) -> None:
    if task is None or task.done():
        return
    task.cancel()
    try:
        await task
    except (asyncio.CancelledError, Exception):  # noqa: BLE001 -- being discarded
        pass


def corrections_usage_if_done(task: asyncio.Task[tuple[CorrectionsResult | None, CallUsage]]) -> CallUsage:
    if task.done() and not task.cancelled() and task.exception() is None:
        return task.result()[1]
    return CallUsage()
