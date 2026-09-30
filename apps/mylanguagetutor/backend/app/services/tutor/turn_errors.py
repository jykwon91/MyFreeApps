"""Pre-stream failures of a tutor turn. The route maps each to an HTTP status
BEFORE the SSE stream opens (quota errors live in ``quota_service``)."""
from __future__ import annotations


class TurnRejectedError(Exception):
    """Base -- never raised directly. ``code`` is the response ``detail``."""

    code = "turn_rejected"


class SessionNotFoundError(TurnRejectedError):
    code = "session_not_found"


class SessionEndedError(TurnRejectedError):
    code = "session_ended"


class SessionTurnLimitError(TurnRejectedError):
    code = "session_turn_limit"


class TurnInProgressError(TurnRejectedError):
    code = "turn_in_progress"
