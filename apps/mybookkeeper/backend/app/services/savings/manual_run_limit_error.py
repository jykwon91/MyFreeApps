"""Raised when a person has used every "Research now" run in the rolling window."""
from __future__ import annotations

import datetime as _dt


class ManualRunLimitError(Exception):
    def __init__(self, next_available_at: _dt.datetime) -> None:
        super().__init__(f"next manual run available at {next_available_at.isoformat()}")
        self.next_available_at = next_available_at
