"""Process-global throttle + exponential backoff around an Anthropic call.

Extracted from MyBookkeeper's claude_service so it can be shared by any app
that calls the Anthropic API. With the defaults the retry semantics are the
pre-extraction behaviour: a single process-global throttle that every call
waits out first, 5 attempts, the ``retry-after`` header honoured, otherwise
``60 * 2**attempt`` backoff, and the 5th attempt re-raises.

A caller running under its own time limit (a queue item, a request) passes
``max_wait_seconds``, the most this call may sleep in total. When the
throttle has longer left than that, the call raises ``RateLimitPausedError``
(kind ``RATE_LIMITED``) without sending the request; a 429 whose wait would
overrun the budget re-raises instead of sleeping. Either way the caller's own
retry schedule takes over. ``rate_limit_pause_seconds()`` says how long the
throttle has left, so a queue can wait before claiming work at all.

``anthropic`` is imported lazily inside ``create_with_backoff`` so apps
that never call Claude don't need the SDK installed (mirrors how
``platform_shared.services.sms_service`` lazily imports ``twilio``).

Rate-limit observability is delegated to an optional ``on_rate_limit``
hook rather than hard-wired to one app's event log, so MyBookkeeper can
keep recording its system event while other consumers stay decoupled.
Per rules/check-third-party-error-codes.md, non-429 Anthropic API
errors are logged at WARNING with the structured ``error.type``, HTTP
status and request id, then re-raised unchanged; callers classify them
with ``platform_shared.extraction.errors.extraction_error_from_anthropic``.
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from platform_shared.extraction.errors import RateLimitPausedError

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
    # False when this 429 is re-raised instead of waited out: it was the last
    # attempt, or the wait would overrun the caller's ``max_wait_seconds``.
    will_retry: bool


OnRateLimit = Callable[[RateLimitEvent], Awaitable[None]]


def rate_limit_pause_seconds() -> float:
    """Seconds until the shared throttle lets the next Anthropic call through.

    0 when no rate limit is in force. A queue that retries items itself
    reads this before claiming one, and waits instead of starting a call
    that would only be rate limited and charged an attempt.
    """
    return max(0.0, throttle.resume_at - time.monotonic())


async def create_with_backoff(
    client: Any,
    *,
    on_rate_limit: OnRateLimit | None = None,
    max_attempts: int = 5,
    max_wait_seconds: float | None = None,
    **kwargs: Any,
) -> "Message":
    """Call ``client.messages.create(**kwargs)`` with throttle + backoff.

    See ``_send_with_backoff`` for the arguments.
    """
    return await _send_with_backoff(
        lambda: client.messages.create(**kwargs),
        on_rate_limit=on_rate_limit,
        max_attempts=max_attempts,
        max_wait_seconds=max_wait_seconds,
    )


async def stream_with_backoff(
    client: Any,
    *,
    on_rate_limit: OnRateLimit | None = None,
    max_attempts: int = 5,
    max_wait_seconds: float | None = None,
    **kwargs: Any,
) -> Any:
    """Stream ``client.beta.messages.stream(**kwargs)`` to its final message, with throttle + backoff.

    Streaming is what the SDK requires for long requests (a large
    ``max_tokens`` or a long server-tool turn), and the beta surface is what
    carries ``betas=[...]`` and ``fallbacks``. Returns the ``BetaMessage``
    from ``get_final_message()``; a failure, including an error event in the
    middle of the stream, is retried or raised exactly as in
    ``create_with_backoff``.
    """
    async def send() -> Any:
        async with client.beta.messages.stream(**kwargs) as stream:
            return await stream.get_final_message()

    return await _send_with_backoff(
        send,
        on_rate_limit=on_rate_limit,
        max_attempts=max_attempts,
        max_wait_seconds=max_wait_seconds,
    )


async def _send_with_backoff(
    send: Callable[[], Awaitable[Any]],
    *,
    on_rate_limit: OnRateLimit | None,
    max_attempts: int,
    max_wait_seconds: float | None,
) -> Any:
    """Run ``send()`` behind the shared throttle, retrying 429s.

    Args:
        send: Makes one request and returns its message.
        on_rate_limit: Optional async hook invoked on every 429 (after
            the WARNING log, before the sleep). Hook failures are logged
            and swallowed so observability never breaks the backoff.
        max_attempts: Total attempts before the final 429 re-raises
            (default 5 — the pre-extraction value).
        max_wait_seconds: The most this call may sleep in total, on the
            shared throttle and between 429 retries. ``None`` (default)
            is unbounded. When the throttle has longer left than this,
            ``RateLimitPausedError`` is raised and no request is sent; a
            429 whose wait would overrun it re-raises at once.
    """
    import anthropic

    waited = 0.0
    delay = rate_limit_pause_seconds()
    if delay > 0:
        if max_wait_seconds is not None and delay > max_wait_seconds:
            logger.info(
                "Throttle active for another %.0fs, longer than the %.0fs wait budget; not sending the request",
                delay, max_wait_seconds,
            )
            raise RateLimitPausedError(delay)
        logger.info("Throttle active, waiting %.0fs before Anthropic request", delay)
        await asyncio.sleep(delay)
        waited += delay

    for attempt in range(max_attempts):
        try:
            result = await send()
            throttle.consecutive_429s = 0
            return result
        except anthropic.RateLimitError as e:
            throttle.consecutive_429s += 1
            retry_after = getattr(getattr(e, "response", None), "headers", {}).get("retry-after")
            wait = float(retry_after) if retry_after else 60 * (2 ** attempt)
            throttle.resume_at = time.monotonic() + wait
            over_budget = max_wait_seconds is not None and waited + wait > max_wait_seconds
            will_retry = attempt < max_attempts - 1 and not over_budget
            if will_retry:
                logger.warning(
                    "Rate limited by Anthropic, waiting %.0fs (attempt %d/%d, consecutive 429s: %d, request_id=%s)",
                    wait, attempt + 1, max_attempts, throttle.consecutive_429s, getattr(e, "request_id", None),
                )
            else:
                logger.warning(
                    "Rate limited by Anthropic, not retrying (%s; Anthropic asks for %.0fs; "
                    "consecutive 429s: %d, request_id=%s)",
                    "wait budget exceeded" if over_budget else f"attempt {attempt + 1} was the last",
                    wait, throttle.consecutive_429s, getattr(e, "request_id", None),
                )
            if on_rate_limit is not None:
                try:
                    await on_rate_limit(
                        RateLimitEvent(
                            attempt=attempt + 1,
                            max_attempts=max_attempts,
                            wait_seconds=wait,
                            consecutive_429s=throttle.consecutive_429s,
                            will_retry=will_retry,
                        )
                    )
                except Exception:
                    logger.warning(
                        "on_rate_limit hook failed (consecutive=%d) — continuing backoff",
                        throttle.consecutive_429s,
                        exc_info=True,
                    )
            if not will_retry:
                raise
            await asyncio.sleep(wait)
            waited += wait
        except anthropic.APIStatusError as e:
            # Non-429 documented API error (auth, invalid_request,
            # overloaded, ...). Log the structured error type, the real HTTP
            # status and Anthropic's request id (what support asks for),
            # then re-raise unchanged for the caller to classify.
            # See rules/check-third-party-error-codes.md.
            logger.warning(
                "Anthropic API error: type=%s status=%s request_id=%s",
                e.type,
                e.status_code,
                e.request_id,
            )
            raise
    raise RuntimeError("unreachable")
