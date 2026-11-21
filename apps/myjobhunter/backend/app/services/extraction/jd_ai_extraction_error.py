"""The Claude step of reading a job-posting link failed."""
from __future__ import annotations

from platform_shared.extraction import AnthropicFailureKind

from app.services.extraction.jd_url_fetcher import JDFetchError


class JDAiExtractionError(JDFetchError):
    """Claude could not read the fetched page.

    ``kind`` is the shared failure kind (``None``: the reply was unreadable).
    The message is our own copy, never the provider's error text.
    """

    def __init__(self, message: str, *, kind: AnthropicFailureKind | None = None) -> None:
        super().__init__(message)
        self.kind = kind
