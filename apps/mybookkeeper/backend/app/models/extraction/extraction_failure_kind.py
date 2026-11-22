from enum import StrEnum


class ExtractionFailureKind(StrEnum):
    """Why a Claude extraction failed, as the queues explain it to the user."""

    CUT_OFF = "cut_off"
    """Claude stopped at its output limit before finishing the reply."""

    UNREADABLE = "unreadable"
    """The reply was not the JSON extraction object asked for."""

    TIMED_OUT = "timed_out"
    """The read ran past its time limit."""

    BUSY = "busy"
    """Anthropic rate limited us, was overloaded or down, or the connection dropped."""

    MISCONFIGURED = "misconfigured"
    """Anthropic rejected our credentials (401 / 403)."""

    REJECTED = "rejected"
    """Anthropic rejected the request itself (400 / 413 / 422), e.g. a file it can't take."""

    OTHER = "other"
    """Not a Claude failure: a bug, a bad file, a database error."""
