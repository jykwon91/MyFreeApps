"""A request tried to change a value the locked lease already holds."""
from __future__ import annotations


class LeaseValueLockedError(ValueError):
    def __init__(self, keys: list[str]) -> None:
        super().__init__(f"Lease values already saved cannot change: {', '.join(keys)}")
        self.keys = keys
