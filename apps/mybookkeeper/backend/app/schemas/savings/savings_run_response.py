"""A savings research run's outcome, as the page needs it (no token accounting)."""
import datetime as _dt
import uuid

from pydantic import BaseModel


class SavingsRunResponse(BaseModel):
    id: uuid.UUID
    trigger: str
    status: str
    started_at: _dt.datetime
    finished_at: _dt.datetime | None
    error_type: str | None
    ideas_found: int
