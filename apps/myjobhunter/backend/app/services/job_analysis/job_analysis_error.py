"""A job fit-analysis failed; the route answers with HTTP 502."""
from __future__ import annotations

from platform_shared.extraction import AnthropicFailureKind

from app.services.extraction.ai_failure import ai_failure_message


class JobAnalysisError(RuntimeError):
    """Generic analysis failure — HTTP 502.

    ``kind`` is the shared Anthropic failure kind when Claude itself failed
    (``None`` for a reply that failed parsing / validation), so the discovery
    score loop and the route route on one classification. ``code`` keeps
    Anthropic's documented ``error.type`` (``rate_limit_error``,
    ``authentication_error``...) for Sentry tags; ``retryable`` is True when
    the next scheduled pass can succeed.
    """

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        retryable: bool = True,
        kind: AnthropicFailureKind | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.kind = kind

    @classmethod
    def from_ai_failure(
        cls, kind: AnthropicFailureKind | None, code: str | None = None,
    ) -> "JobAnalysisError":
        """A Claude failure, with our own copy as the message (never provider text)."""
        return cls(
            ai_failure_message(kind),
            code=code,
            retryable=kind is None or kind.is_transient,
            kind=kind,
        )
