"""Pydantic schema for PUT /welcome-manuals/{id}/rooms/order."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field


class WelcomeManualRoomReorderRequest(BaseModel):
    """Full permutation of a manual's room ids, in the desired order.

    The service rejects a list that isn't exactly the manual's current room
    set, so a stale client can't silently drop a room from the ordering.
    """

    room_ids: list[uuid.UUID] = Field(min_length=1)

    model_config = ConfigDict(extra="forbid")
