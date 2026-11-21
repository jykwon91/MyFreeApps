"""Classify Anthropic SDK failures into app-agnostic failure kinds.

Extracted from MyGamingAssistant's WoW item reader (``_map_status_error``)
when MyLanguageTutor became the second consumer (auto-promote rule), and now
the one classification behind ``ExtractionError.kind`` for every app. It has
since diverged from the MGA original: a 404 (missing model / endpoint) is
MISCONFIGURED, and ``map_anthropic_error`` also covers connection, timeout
and other ``APIError`` failures. Callers parameterise only the log prefix
(``"wow item extract"``, ``"tutor reply"``...) and the logger.

Each app maps the returned ``AnthropicFailureKind`` to its own exception
class / HTTP status / SSE error code, so this module never imports FastAPI
and never decides what the end user sees.

Per rules/check-third-party-error-codes.md the documented ``error.type``
(``rate_limit_error``, ``authentication_error``, ``overloaded_error``...)
is always logged — at ERROR for credential problems and generic upstream
failures (operator action needed), WARNING for rate limits and rejected
input. Never pass request content into these logs.

``anthropic`` is imported lazily so apps that never call Claude don't need
the SDK installed (same posture as ``platform_shared.extraction.backoff``).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import anthropic

_module_logger = logging.getLogger(__name__)

# HTTP statuses Anthropic uses when the REQUEST itself is unusable (bad image,
# oversized body, schema the model can't satisfy) — retrying won't help.
_INPUT_REJECTED_STATUSES = (400, 413, 422)


class AnthropicFailureKind(StrEnum):
    """What went wrong, from the caller's point of view."""

    RATE_LIMITED = "rate_limited"
    """``rate_limit_error`` (429) — our org is over its Anthropic rate limit."""

    MISCONFIGURED = "misconfigured"
    """Credentials / permissions rejected (401 / 403) or model not found (404) — an operator problem."""

    INPUT_REJECTED = "input_rejected"
    """Anthropic rejected the request body (400 / 413 / 422)."""

    UPSTREAM = "upstream"
    """Overloaded, 5xx, 408 / 409, timeout, or unreachable — transient, retry later."""

    @property
    def is_transient(self) -> bool:
        """True when the same request can succeed later (retry / "try again")."""
        return self in _TRANSIENT_KINDS


# Rate limits and upstream trouble clear on their own. Credentials, a missing
# model and a rejected request do not — retrying them only repeats the failure.
_TRANSIENT_KINDS = frozenset({AnthropicFailureKind.RATE_LIMITED, AnthropicFailureKind.UPSTREAM})


@dataclass(frozen=True)
class AnthropicFailure:
    kind: AnthropicFailureKind
    error_type: str
    """Anthropic's documented ``error.type`` or ``http_<status>`` / ``connection_error``."""
    status: int | None = None


def map_anthropic_status_error(
    exc: "anthropic.APIStatusError",
    *,
    log_prefix: str,
    logger: logging.Logger | None = None,
) -> AnthropicFailure:
    """Log Anthropic's documented ``error.type`` and classify the failure.

    Args:
        exc: The ``anthropic.APIStatusError`` (or subclass) that was raised —
            from ``messages.create`` or mid-stream.
        log_prefix: Short, content-free feature label for the log line.
        logger: Logger to emit on (default: this module's). Pass the caller's
            module logger so records keep the feature's logger name.
    """
    import anthropic

    log = logger or _module_logger
    error_type = exc.type or f"http_{exc.status_code}"
    status = exc.status_code
    if isinstance(exc, anthropic.RateLimitError):
        log.warning("%s: rate limited: error_type=%s", log_prefix, error_type)
        return AnthropicFailure(AnthropicFailureKind.RATE_LIMITED, error_type, status)
    if isinstance(exc, (anthropic.AuthenticationError, anthropic.PermissionDeniedError)):
        log.error(
            "%s: credentials rejected: error_type=%s status=%s",
            log_prefix,
            error_type,
            status,
        )
        return AnthropicFailure(AnthropicFailureKind.MISCONFIGURED, error_type, status)
    if isinstance(exc, anthropic.NotFoundError):
        # On messages.create a 404 means the model id (or endpoint) does not
        # exist — a deploy/config problem that no retry will fix.
        log.error(
            "%s: model or endpoint not found: error_type=%s status=%s",
            log_prefix,
            error_type,
            status,
        )
        return AnthropicFailure(AnthropicFailureKind.MISCONFIGURED, error_type, status)
    if status in _INPUT_REJECTED_STATUSES:
        log.warning(
            "%s: input rejected: error_type=%s status=%s", log_prefix, error_type, status
        )
        return AnthropicFailure(AnthropicFailureKind.INPUT_REJECTED, error_type, status)
    log.error("%s: upstream error: error_type=%s status=%s", log_prefix, error_type, status)
    return AnthropicFailure(AnthropicFailureKind.UPSTREAM, error_type, status)


def map_anthropic_connection_error(
    exc: "anthropic.APIConnectionError",
    *,
    log_prefix: str,
    logger: logging.Logger | None = None,
) -> AnthropicFailure:
    """Classify a transport failure (includes ``APITimeoutError``) as UPSTREAM."""
    log = logger or _module_logger
    log.warning("%s: connection error: %s", log_prefix, type(exc).__name__)
    return AnthropicFailure(AnthropicFailureKind.UPSTREAM, "connection_error", None)


def map_anthropic_error(
    exc: "anthropic.APIError",
    *,
    log_prefix: str,
    logger: logging.Logger | None = None,
) -> AnthropicFailure:
    """Classify any Anthropic SDK error: status errors, transport errors, the rest.

    ``APIConnectionError`` / ``APITimeoutError`` derive from ``APIError``, not
    from ``APIStatusError`` or the built-in ``ConnectionError`` /
    ``TimeoutError`` — hand-written ``isinstance`` checks miss them, which is
    why every caller should come through here.
    """
    import anthropic

    if isinstance(exc, anthropic.APIStatusError):
        return map_anthropic_status_error(exc, log_prefix=log_prefix, logger=logger)
    if isinstance(exc, anthropic.APIConnectionError):
        return map_anthropic_connection_error(exc, log_prefix=log_prefix, logger=logger)
    # e.g. APIResponseValidationError: Anthropic answered with something the
    # SDK could not read. Nothing about our request was wrong.
    log = logger or _module_logger
    error_type = type(exc).__name__
    log.error("%s: unexpected API error: error_type=%s", log_prefix, error_type)
    return AnthropicFailure(AnthropicFailureKind.UPSTREAM, error_type, None)
