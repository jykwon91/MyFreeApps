"""PATCH /listings/blackouts/{blackout_id} request body."""
from __future__ import annotations

from pydantic import BaseModel


class BlackoutUpdateRequest(BaseModel):
    """Editable fields on a listing blackout.

    Only host_notes for now — future editable fields (e.g. a custom display
    label) slot in here without changing the endpoint shape.
    """

    host_notes: str | None = None
