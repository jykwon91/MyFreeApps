"""Outcome states for ``tutor_turn.status``.

- ``complete``: the tutor reply (and corrections) were fully generated.
- ``partial``: the reply stream was cut off; ``reply_text`` may be truncated.
- ``failed``: no usable reply; only the learner's text was recorded.
"""
from __future__ import annotations

from enum import StrEnum


class TurnStatus(StrEnum):
    COMPLETE = "complete"
    PARTIAL = "partial"
    FAILED = "failed"


TURN_STATUS_CODES: tuple[str, ...] = tuple(s.value for s in TurnStatus)
