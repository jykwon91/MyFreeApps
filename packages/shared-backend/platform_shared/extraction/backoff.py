"""Process-global throttle + exponential backoff around an Anthropic call.

Extracted verbatim from MyBookkeeper's claude_service so it can be
shared by any app that calls the Anthropic API. The retry semantics are
byte-for-byte the pre-extraction behaviour: a single process-global
throttle, 5 attempts, ``retry-after`` header honoured, otherwise
``60 * 2**attempt`` backoff, the 5th attempt re-raises.

``anthropic`` is imported lazily inside ``create_with_backoff`` so apps
that never call Claude don't need the SDK installed (mirrors how
``platform_shared.services.sms_service`` lazily imports ``twilio``).

Rate-limit observability is delegated to an optional ``on_rate_limit``
hook rather than hard-wired to one app's event log, so MyBookkeeper can
keep recording its system event while other consumers stay decoupled.
Per rules/check-third-party-error-codes.md, non-429 Anthropic API
errors are logged at WARNING with the structured ``error.type`` /
status and then re-raised unchanged (propagation is preserved — callers
that categorised the raw SDK exception still see it).
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from anthropic.types import Message

logger = logging.getLogger(__name__)


@dataclass
class ThrottleState:
    consecutive_429s: int = 0
    resume_at: float = 0.0


# Single process-global throttle, shared across every caller in the
# process (extraction AND any other Anthropic call, e.g. MBK's tax
# advisor) — exactly the pre-extraction behaviour.
throttle = ThrottleState()


@dataclass
class RateLimitEvent:
    """Context passed to the ``on_rate_limit`` hook on each 429.

    Carries everything MyBookkeeper's ``record_event`` call needed so the
    hook can reproduce the exact prior system-event payload.
    """

    attempt: int  # 1-based
    max_attempts: int
    wait_seconds: float
    consecutive_429s: int


OnRateLimit = Callable[[RateLimitEvent], Awaitable[None]]


async def create_with_backoff(
    client: Any,
    *,
    on_rate_limit: OnRateLimit | None = None,
    max_attempts: int = 5,
    **kwargs: Any,
) -> "Message":
    """Call ``client.messages.create(**kwargs)`` with throttle + backoff.

    Args:
        client: An ``anthropic.AsyncAnthropic`` instance.
        on_rate_limit: Optional async hook invoked on every 429 (after
            the WARNING log, before the sleep). Hook failures are logged
            and swallowed so observability never breaks the backoff.
        max_attempts: Total attempts before the final 429 re-raises
            (default 5 — the pre-extraction value).
        **kwargs: Forwarded verbatim to ``client.messages.create``.
    """
    import anthropic

    now = time.monotonic()
    if now < throttle.resume_at:
        delay = throttle.resume_at - now
        logger.info("Throttle active, waiting %.0fs before Anthropic request", delay)
        await asyncio.sleep(delay)

    for attempt in range(max_attempts):
        try:
            result = await client.messages.create(**kwargs)
            throttle.consecutive_429s = 0
            return result
        except anthropic.RateLimitError as e:
            throttle.consecutive_429s += 1
            retry_after = getattr(getattr(e, "response", None), "headers", {}).get("retry-after")
            wait = float(retry_after) if retry_after else 60 * (2 ** attempt)
            throttle.resume_at = time.monotonic() + wait
            logger.warning(
                "Rate limited by Anthropic, waiting %.0fs (attempt %d/%d, consecutive 429s: %d)",
                wait, attempt + 1, max_attempts, throttle.consecutive_429s,
            )
            if on_rate_limit is not None:
                try:
                    await on_rate_limit(
                        RateLimitEvent(
                            attempt=attempt + 1,
                            max_attempts=max_attempts,
                            wait_seconds=wait,
                            consecutive_429s=throttle.consecutive_429s,
                        )
                    )
                except Exception:
                    logger.warning(
                        "on_rate_limit hook failed (consecutive=%d) — continuing backoff",
                        throttle.consecutive_429s,
                        exc_info=True,
                    )
            if attempt == max_attempts - 1:
                raise
            await asyncio.sleep(wait)
        except anthropic.APIStatusError as e:
            # Non-429 documented API error (auth, invalid_request,
            # overloaded, ...). Capture the structured error type for
            # log aggregation, then re-raise UNCHANGED so existing
            # callers that categorise the raw SDK exception are
            # unaffected. See rules/check-third-party-error-codes.md.
            logger.warning(
                "Anthropic API error: type=%s status=%s",
                getattr(e, "type", None),
                getattr(e, "status", None),
            )
            raise
    raise RuntimeError("unreachable")
