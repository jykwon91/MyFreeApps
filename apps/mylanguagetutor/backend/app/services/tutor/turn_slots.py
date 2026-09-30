"""One tutor turn in flight per user (per process).

A second turn while the first is still streaming would race the first for
the conversation history and double-reserve quota for no benefit. The route
holds the slot for the life of the request via a yield-dependency, so it is
released even if the stream never starts.
"""
from __future__ import annotations

import uuid


class TurnSlots:
    def __init__(self) -> None:
        self._active: set[uuid.UUID] = set()

    def try_acquire(self, user_id: uuid.UUID) -> bool:
        if user_id in self._active:
            return False
        self._active.add(user_id)
        return True

    def release(self, user_id: uuid.UUID) -> None:
        self._active.discard(user_id)

    def clear(self) -> None:
        """Test helper."""
        self._active.clear()


turn_slots = TurnSlots()
