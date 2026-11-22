"""Typed errors for the shared extraction service.

Mirrors the error-class shape of ``platform_shared.services.sms_service``:
a "not configured" error distinct from runtime failures, with the
provider error type/status embedded so callers re-raising over HTTP can
build a useful 4xx/5xx body without importing the Anthropic SDK
exception types. See rules/check-third-party-error-codes.md.

``ExtractionError.kind`` is the one classification every caller routes on
(``is_transient``: retry later / "try again" vs report as final), so no
consumer writes its own ``isinstance`` checks against the SDK hierarchy.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from platform_shared.extraction.anthropic_errors import (
    AnthropicFailureKind,
    map_anthropic_error,
)

if TYPE_CHECKING:
    import anthropic


class ExtractionNotConfiguredError(RuntimeError):
    """Raised when the Anthropic API key is missing.

    Use platform_shared.core.boot_guards.check_extraction_configured()
    at lifespan startup so deploys fail loud instead of every extraction
    silently raising in production.
    """


class ExtractionError(RuntimeError):
    """Raised on a runtime extraction failure that is not a misconfiguration.

    The Anthropic ``error.type``, HTTP status and failure ``kind`` are
    exposed as attributes so a caller can decide retry-vs-final and build its
    own user-facing copy without importing ``anthropic``. ``kind`` is None for
    failures that are not a provider error (e.g. ``ExtractionParseError``).
    The message never carries the provider's response body.
    """

    def __init__(
        self,
        message: str,
        *,
        error_type: str | None = None,
        status: int | None = None,
        kind: AnthropicFailureKind | None = None,
    ) -> None:
        super().__init__(message)
        self.error_type = error_type
        self.status = status
        self.kind = kind

    @property
    def is_transient(self) -> bool:
        """True when the same request can succeed later."""
        return self.kind is not None and self.kind.is_transient


class ExtractionParseError(ExtractionError):
    """Raised when the model response could not be parsed as JSON.

    Distinct from ExtractionError so callers can choose a domain-specific
    fallback (e.g. a low-confidence placeholder record) on parse failure
    while still propagating genuine API/transport errors.
    """


class ExtractionTruncatedError(ExtractionParseError):
    """Raised when the model stopped at ``max_tokens`` before finishing its reply.

    A cut-off reply is never parsed: the JSON scan would happily return the
    first complete nested object of a truncated list, silently dropping the
    rest. Subclasses ExtractionParseError so callers that already treat an
    unparseable reply as a failure handle this one the same way.
    """


class RateLimitPausedError(ExtractionError):
    """Raised, without calling the API, when the shared throttle outlasts the caller's wait budget.

    Anthropic rate limited an earlier call and asked us to hold off for longer
    than this caller may wait, so the request was never sent. ``kind`` is
    ``RATE_LIMITED`` (transient); ``retry_after_seconds`` is how long the
    throttle has left, so a queue can schedule its next try for when the
    throttle lifts. No request was made, so a queue counting attempts should
    not count this one.
    """

    def __init__(self, retry_after_seconds: float) -> None:
        super().__init__(
            f"Anthropic rate limit in force for another {retry_after_seconds:.0f}s; request not sent",
            error_type="rate_limit_error",
            kind=AnthropicFailureKind.RATE_LIMITED,
        )
        self.retry_after_seconds = retry_after_seconds


def extraction_error_from_anthropic(
    exc: "anthropic.APIError",
    *,
    log_prefix: str,
    logger: logging.Logger | None = None,
) -> ExtractionError:
    """Classify (and log) an Anthropic SDK error as a typed ``ExtractionError``.

    Raise the result ``from exc`` so the SDK error stays on ``__cause__``.
    """
    failure = map_anthropic_error(exc, log_prefix=log_prefix, logger=logger)
    return ExtractionError(
        f"{log_prefix}: Anthropic {failure.kind} error "
        f"(error_type={failure.error_type} status={failure.status})",
        error_type=failure.error_type,
        status=failure.status,
        kind=failure.kind,
    )


def is_transient_failure(
    exc: BaseException,
    *,
    extra_transient: tuple[type[BaseException], ...] = (),
) -> bool:
    """True when retrying the same work later can succeed.

    An ``ExtractionError`` answers by its ``kind``. Any other exception is
    transient only if it is one of ``extra_transient`` — the caller names the
    non-Claude failures that clear on their own in its own pipeline (e.g. a
    ``TimeoutError`` / ``ConnectionError`` reading from storage).
    """
    if isinstance(exc, ExtractionError):
        return exc.is_transient
    return bool(extra_transient) and isinstance(exc, extra_transient)
