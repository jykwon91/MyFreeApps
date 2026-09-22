"""Failure modes of the WoW item reader.

The API layer (``app/api/wow_items.py``) maps each class to an HTTP status and
a user-facing message. ``error_type`` carries the Anthropic ``error.type`` (or
our own code) for logs.
"""


class ItemExtractionError(Exception):
    """Base class — never raised directly."""

    def __init__(self, message: str, *, error_type: str | None = None) -> None:
        super().__init__(message)
        self.error_type = error_type


class ItemExtractionNotConfiguredError(ItemExtractionError):
    """ANTHROPIC_API_KEY is not set on this deployment."""


class ItemExtractionDailyCapError(ItemExtractionError):
    """The global daily cap of Claude calls (WOW_EXTRACT_DAILY_CAP) is used up."""


class ItemExtractionInputError(ItemExtractionError):
    """The request itself is unusable (no input, both inputs, bad image, too long)."""


class ItemExtractionTooLargeError(ItemExtractionError):
    """The uploaded image is over the size cap."""


class ItemExtractionRateLimitedError(ItemExtractionError):
    """Anthropic answered rate_limit_error."""


class ItemExtractionMisconfiguredError(ItemExtractionError):
    """Anthropic rejected our credentials or permissions — an operator problem."""


class ItemExtractionUpstreamError(ItemExtractionError):
    """Anthropic is overloaded, errored, timed out, or was unreachable."""


class ItemExtractionUnreadableError(ItemExtractionError):
    """Anthropic rejected the input (bad image), or returned no usable tool call."""


class NotAnItemTooltipError(ItemExtractionError):
    """The input was readable but isn't a WoW item tooltip."""
