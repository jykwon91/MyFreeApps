"""Typed errors for the shared extraction service.

Mirrors the error-class shape of ``platform_shared.services.sms_service``:
a "not configured" error distinct from runtime failures, with the
provider error type/status embedded so callers re-raising over HTTP can
build a useful 4xx/5xx body without importing the Anthropic SDK
exception types. See rules/check-third-party-error-codes.md.
"""
from __future__ import annotations


class ExtractionNotConfiguredError(RuntimeError):
    """Raised when the Anthropic API key is missing.

    Use platform_shared.core.boot_guards.check_extraction_configured()
    at lifespan startup so deploys fail loud instead of every extraction
    silently raising in production.
    """


class ExtractionError(RuntimeError):
    """Raised on a runtime extraction failure that is not a misconfiguration.

    The Anthropic ``error.type`` and HTTP status are embedded in the
    message and exposed as attributes so a caller re-raising via HTTP can
    surface a useful body without importing ``anthropic``.
    """

    def __init__(
        self,
        message: str,
        *,
        error_type: str | None = None,
        status: int | None = None,
    ) -> None:
        super().__init__(message)
        self.error_type = error_type
        self.status = status


class ExtractionParseError(ExtractionError):
    """Raised when the model response could not be parsed as JSON.

    Distinct from ExtractionError so callers can choose a domain-specific
    fallback (e.g. a low-confidence placeholder record) on parse failure
    while still propagating genuine API/transport errors.
    """
