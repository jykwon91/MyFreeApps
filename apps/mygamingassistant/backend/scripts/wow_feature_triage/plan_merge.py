"""One merge in a triage plan: ``story_id`` becomes a duplicate of ``into``."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict


class PlanMerge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    story_id: uuid.UUID
    into: uuid.UUID
