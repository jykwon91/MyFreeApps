"""Whether, and when, to try a failed Claude extraction again.

Shared by the two queues that read documents with Claude: the upload worker
(``app/workers/upload_processor_worker.py``) and the Gmail email queue
(``app/services/email/email_extraction_service.py``). Both retry a retryable
failure later, within a bounded number of attempts, and fail anything else
straight away, with a message chosen by the failure's kind.

Anthropic failures are classified once, in platform_shared
(``ExtractionError.kind`` / ``is_transient_failure``); this module only adds
MyBookkeeper's rule for unreadable replies and picks the message.

A read that never started because Anthropic's rate limit outlasts the read's
wait budget (``RateLimitPausedError``) is not a failure: the queues put the
item back without counting an attempt, for when the limit lifts.
"""
from datetime import datetime, timedelta

import anthropic
from platform_shared.extraction import (
    AnthropicFailureKind,
    ExtractionError,
    ExtractionParseError,
    ExtractionTruncatedError,
    is_transient_failure,
)

from app.core.document_constants import (
    CLAUDE_RETRY_BASE_DELAY_SECONDS,
    CLAUDE_RETRY_MAX_DELAY_SECONDS,
    TRANSIENT_EXTRACTION_ERROR_TYPES,
)
from app.models.extraction.extraction_failure import ExtractionFailure
from app.models.extraction.extraction_failure_kind import ExtractionFailureKind

_KIND_FOR_ANTHROPIC_FAILURE = {
    AnthropicFailureKind.RATE_LIMITED: ExtractionFailureKind.BUSY,
    AnthropicFailureKind.UPSTREAM: ExtractionFailureKind.BUSY,
    AnthropicFailureKind.MISCONFIGURED: ExtractionFailureKind.MISCONFIGURED,
    AnthropicFailureKind.INPUT_REJECTED: ExtractionFailureKind.REJECTED,
}


def is_retryable_extraction_error(exc: BaseException) -> bool:
    """The one retry decision for both queues.

    Retryable: what the shared classification calls transient (rate limits,
    overload, 5xx, timeouts, dropped connections) plus the read timing out,
    and a reply that could not be parsed. The shared classification calls an
    unreadable reply final; here a fresh read usually succeeds, and treating
    it as final would lose the email or document, so it gets the same bounded
    retries. A reply cut off at the output limit is final: the same input
    gives the same cut-off, so retrying only spends tokens.
    """
    if isinstance(exc, ExtractionTruncatedError):
        return False
    if isinstance(exc, ExtractionParseError):
        return True
    return is_transient_failure(exc, extra_transient=TRANSIENT_EXTRACTION_ERROR_TYPES)


def classify_extraction_failure(exc: BaseException) -> ExtractionFailure:
    """What went wrong, for the user's message, and whether to try again."""
    return ExtractionFailure(kind=_kind_of(exc), retryable=is_retryable_extraction_error(exc))


def retry_delay_seconds(attempt: int, exc: BaseException) -> float:
    """Seconds to wait after failed attempt ``attempt`` (1-based).

    Doubles from the base delay, or follows Anthropic's ``retry-after`` (sent
    on a 429 rate limit and a 529 overloaded) when that asks for longer,
    capped at the maximum delay.
    """
    delay = float(CLAUDE_RETRY_BASE_DELAY_SECONDS * 2 ** (attempt - 1))
    retry_after = _retry_after_seconds(exc)
    if retry_after is not None:
        delay = max(delay, retry_after)
    return min(delay, float(CLAUDE_RETRY_MAX_DELAY_SECONDS))


def next_attempt_at(attempt: int, exc: BaseException, now: datetime) -> datetime:
    return now + timedelta(seconds=retry_delay_seconds(attempt, exc))


def _kind_of(exc: BaseException) -> ExtractionFailureKind:
    if isinstance(exc, ExtractionTruncatedError):
        return ExtractionFailureKind.CUT_OFF
    if isinstance(exc, ExtractionParseError):
        return ExtractionFailureKind.UNREADABLE
    if isinstance(exc, ExtractionError) and exc.kind is not None:
        return _KIND_FOR_ANTHROPIC_FAILURE[exc.kind]
    if isinstance(exc, TimeoutError):
        return ExtractionFailureKind.TIMED_OUT
    if isinstance(exc, ConnectionError):
        return ExtractionFailureKind.BUSY
    return ExtractionFailureKind.OTHER


def _retry_after_seconds(exc: BaseException) -> float | None:
    """Anthropic's ``retry-after`` (seconds), from the SDK error the shared service raised from."""
    cause = exc.__cause__ if isinstance(exc, ExtractionError) else exc
    if not isinstance(cause, anthropic.APIStatusError):
        return None
    value = cause.response.headers.get("retry-after")
    if value is None:
        return None
    try:
        seconds = float(value)
    except ValueError:
        return None
    return seconds if seconds >= 0 else None
