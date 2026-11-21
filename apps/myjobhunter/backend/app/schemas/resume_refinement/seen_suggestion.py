"""Which suggestion the user was looking at when they answered it."""
from __future__ import annotations

from pydantic import BaseModel, Field


class SeenSuggestion(BaseModel):
    """The session position the client was showing when the user acted.

    Accept, accept-flagged, write-my-own and skip act on whatever
    suggestion is pending on the server. A client that is a step behind
    (a second tap before the next suggestion reached the screen, or a
    retry after an answer was lost) would otherwise apply a suggestion the
    user never saw. With these set, the server refuses the action with a
    coded 409 when the session has moved on since.

    Both are optional so older phone builds, which send neither, keep
    working as before.
    """

    seen_target_index: int | None = Field(default=None, ge=0)
    seen_turn_count: int | None = Field(default=None, ge=0)
