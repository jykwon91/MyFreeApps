"""Lifecycle states for ``tutor_session.status``."""
from __future__ import annotations

from enum import StrEnum


class SessionStatus(StrEnum):
    ACTIVE = "active"
    ENDED = "ended"


SESSION_STATUS_CODES: tuple[str, ...] = tuple(s.value for s in SessionStatus)
