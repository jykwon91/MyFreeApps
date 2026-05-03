"""PATCH /listings/blackouts/{blackout_id} request body."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

_HOST_NOTES_MAX_LEN = 10000


class BlackoutUpdateRequest(BaseModel):
    """Editable fields on a listing blackout.

    Only host_notes for now — future editable fields (e.g. a custom display
    label) slot in here without changing the endpoint shape.
    """

    host_notes: str | None = Field(default=None, max_length=_HOST_NOTES_MAX_LEN)

    model_config = ConfigDict(extra="forbid")
